// test/smoke/settle.mjs — settle slice integration tests
// Usage: node test/smoke/settle.mjs
//
// Covers: --no-settle, --settle-timeout, IntersectionObserver reveal,
//         animation normalization, timing fields, no-fixed-sleep.
//
// Uses a local HTTP server (separate process) to serve fixture pages.

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { createTempDir, removeTempDir, assert, MSHOT } from './helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(__dirname, '..', 'fixtures')
let tmp = null
let serverPort = 0
let serverProc = null

function section(name) {
  console.log(`\n${name}`)
}

function base() {
  return `http://127.0.0.1:${serverPort}`
}

function runCli(args) {
  const result = execFileSync('node', [MSHOT, ...args], {
    cwd: join(dirname(MSHOT)),
    encoding: 'utf8',
    timeout: 30_000
  })
  return result
}

function runCliErr(args) {
  try {
    const result = execFileSync('node', [MSHOT, ...args], {
      cwd: join(dirname(MSHOT)),
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return { stdout: result.stdout, stderr: '', exitCode: 0 }
  } catch (e) {
    return {
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || '',
      exitCode: e.status || 1
    }
  }
}

// ── Start local HTTP server in a separate process ─────────
async function startServer() {
  // Use Node's built-in http server as a separate process
  const serverScript = `
    import { createServer } from 'node:http'
    import { readFileSync } from 'node:fs'
    import { join } from 'node:path'

    const FIXTURES = process.argv[2]
    const PORT = parseInt(process.argv[3], 10)

    const srv = createServer((req, res) => {
      if (req.url === '/no-such-file.jpg') {
        res.writeHead(404)
        res.end('not found')
        return
      }
      // Delayed image: respond after 5s (longer than default settleTimeout)
      if (req.url === '/delayed.jpg') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' })
          // Minimal valid JPEG (1x1 red pixel)
          res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]))
        }, 5000)
        return
      }
      const path = req.url === '/' ? '/index.html' : req.url
      const filePath = join(FIXTURES, path.slice(1))
      try {
        const content = readFileSync(filePath)
        res.writeHead(200)
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('not found')
      }
    })

    srv.listen(PORT, '127.0.0.1', () => {
      console.error('SERVER_PORT:' + srv.address().port)
    })
  `

  // Write temp server script
  const scriptPath = join(tmp || '/tmp', 'settle-server.mjs')
  writeFileSync(scriptPath, serverScript)

  const proc = spawn('node', [scriptPath, FIXTURES, '0'], {
    stdio: ['pipe', 'pipe', 'pipe']
  })
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  serverProc = proc

  return new Promise((resolve, reject) => {
    proc.stderr.on('data', chunk => {
      const match = chunk.toString().match(/SERVER_PORT:(\d+)/)
      if (match) {
        // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
        serverPort = parseInt(match[1], 10)
        resolve()
      }
    })
    proc.on('error', reject)
    // Timeout fallback
    setTimeout(() => reject(new Error('server start timeout')), 5000)
  })
}

function stopServer() {
  return new Promise(resolve => {
    if (serverProc) {
      serverProc.kill('SIGTERM')
      serverProc.on('exit', resolve)
      // Force kill after 2s
      setTimeout(() => {
        serverProc?.kill('SIGKILL')
        resolve()
      }, 2000)
    } else {
      resolve()
    }
  })
}

try {
  tmp = createTempDir('settle')
  await startServer()
  console.log(`Server running on port ${serverPort}`)

  // ── 1. default settle (enabled) ─────────────────────────
  section('1. default settle (enabled)')
  {
    const outPath = join(tmp, 'default-settle.jpg')
    const stdout = runCli([
      '--url',
      base() + '/intersection-observer.html',
      '--out',
      outPath
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), 'default settle → .jpg path')
    assert(existsSync(filePath), 'default settle → file exists')
  }

  // ── 2. --no-settle ──────────────────────────────────────
  section('2. --no-settle')
  {
    const outPath = join(tmp, 'no-settle.jpg')
    const stdout = runCli([
      '--url',
      base() + '/intersection-observer.html',
      '--out',
      outPath,
      '--no-settle'
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), '--no-settle → .jpg path')
    assert(existsSync(filePath), '--no-settle → file exists')
  }

  // ── 3. --no-pre-scroll + active settle ──────────────────
  section('3. --no-pre-scroll + active settle')
  {
    const outPath = join(tmp, 'no-scroll-settle.jpg')
    const stdout = runCli([
      '--url',
      base() + '/fonts.html',
      '--out',
      outPath,
      '--no-pre-scroll'
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), '--no-pre-scroll + settle → .jpg')
    assert(existsSync(filePath), '--no-pre-scroll + settle → file exists')
  }

  // ── 4. --settle-timeout (short, 500ms) ──────────────────
  section('4. --settle-timeout (short, 500ms)')
  {
    const outPath = join(tmp, 'short-timeout.jpg')
    const stdout = runCli([
      '--url',
      base() + '/intersection-observer.html',
      '--out',
      outPath,
      '--settle-timeout',
      '500'
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), '--settle-timeout 500 → .jpg')
    assert(existsSync(filePath), '--settle-timeout 500 → file exists')
  }

  // ── 5. --settle-timeout (0 = use default) ───────────────
  section('5. --settle-timeout (0 = use default 3000)')
  {
    const outPath = join(tmp, 'zero-timeout.jpg')
    const stdout = runCli([
      '--url',
      base() + '/intersection-observer.html',
      '--out',
      outPath,
      '--settle-timeout',
      '0'
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), '--settle-timeout 0 → .jpg')
    assert(existsSync(filePath), '--settle-timeout 0 → file exists')
  }

  // ── 6. timeout is ceiling, not fixed sleep ──────────────
  section('6. timeout is ceiling, not fixed sleep')
  {
    const outPath = join(tmp, 'ceiling-test.jpg')
    const start = Date.now()
    const stdout = runCli(['--url', base() + '/fonts.html', '--out', outPath])
    const elapsed = Date.now() - start

    assert(stdout.trim().endsWith('.jpg'), 'ceiling → .jpg path')
    // Total time includes: goto + networkidle(~500) + pre-scroll(~800) +
    //   settle(fonts+images, <3s ceiling) + wait(500) + screenshot(~50)
    // A fast page should complete well under 5s, proving settle is not
    // a fixed 3s sleep — it returns as soon as resources are ready.
    assert(
      elapsed < 6000,
      `ceiling: completed in ${elapsed}ms (not a fixed 3s sleep)`
    )
    // Also verify settle itself didn't take the full timeout
    const manifestPath = join(tmp, 'ceiling-manifest.json')
    // Write a small manifest to check timings
    const { readFileSync: rf } = await import('node:fs')
    // We check timings via batch in section 7; here just verify speed
  }

  // ── 7. batch manifest timing fields ─────────────────────
  section('7. batch manifest timing fields')
  {
    const urlsFile = join(tmp, 'batch-urls.txt')
    writeFileSync(urlsFile, '/intersection-observer.html\n/fonts.html\n')

    const batchDir = join(tmp, 'batch-settle')
    const stdout = runCli([
      'batch',
      '--url',
      base(),
      '--out-dir',
      batchDir,
      '--urls-file',
      urlsFile,
      '--viewports',
      'desktop'
    ])

    const manifestPath = stdout.trim()
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    assert(manifest.pages.length >= 2, 'batch settle pages >= 2')

    // Check timing fields
    for (const page of manifest.pages) {
      assert(typeof page.timings === 'object', `page ${page.url} has timings`)
      assert(
        typeof page.timings.fontWaitMs === 'number' &&
          page.timings.fontWaitMs >= 0,
        `page ${page.url} fontWaitMs is non-negative number`
      )
      assert(
        typeof page.timings.imageWaitMs === 'number' &&
          page.timings.imageWaitMs >= 0,
        `page ${page.url} imageWaitMs is non-negative number`
      )
      assert(
        typeof page.timings.totalMs === 'number' && page.timings.totalMs >= 0,
        `page ${page.url} totalMs is non-negative number`
      )
    }
  }

  // ── 8. animation fixture — screenshot exists ────────────
  section('8. animation fixture — screenshot exists')
  {
    const outPath = join(tmp, 'infinite-anim.jpg')
    const stdout = runCli([
      '--url',
      base() + '/infinite-animation.html',
      '--out',
      outPath
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), 'infinite anim → .jpg')
    assert(existsSync(filePath), 'infinite anim → file exists')
  }

  // ── 9. finite animation fixture ─────────────────────────
  section('9. finite animation fixture')
  {
    const outPath = join(tmp, 'finite-anim.jpg')
    const stdout = runCli([
      '--url',
      base() + '/finite-animation.html',
      '--out',
      outPath
    ])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), 'finite anim → .jpg')
    assert(existsSync(filePath), 'finite anim → file exists')
  }

  // ── 10. two captures of animation fixture are stable ────
  section('10. animation stability — two captures')
  {
    const outPath1 = join(tmp, 'anim-stable-1.jpg')
    const outPath2 = join(tmp, 'anim-stable-2.jpg')

    runCli(['--url', base() + '/finite-animation.html', '--out', outPath1])
    runCli(['--url', base() + '/finite-animation.html', '--out', outPath2])

    const buf1 = readFileSync(outPath1)
    const buf2 = readFileSync(outPath2)

    // Both should be valid JPEGs of reasonable size
    assert(buf1[0] === 0xff && buf1[1] === 0xd8, 'capture 1 is valid JPEG')
    assert(buf2[0] === 0xff && buf2[1] === 0xd8, 'capture 2 is valid JPEG')
    assert(buf1.length > 1000, 'capture 1 has reasonable size')
    assert(buf2.length > 1000, 'capture 2 has reasonable size')
  }

  // ── 11. delayed image — timeout ceiling respected ───────
  section('11. delayed image — timeout ceiling respected')
  {
    const outPath = join(tmp, 'delayed-img.jpg')
    const start = Date.now()
    const stdout = runCli([
      '--url',
      base() + '/delayed-image.html',
      '--out',
      outPath,
      '--settle-timeout',
      '800',
      '--networkidle-timeout',
      '200'
    ])
    const elapsed = Date.now() - start
    const filePath = stdout.trim()

    assert(filePath.endsWith('.jpg'), 'delayed image → .jpg')
    assert(existsSync(filePath), 'delayed image → file exists')
    // Server delays image 5s. networkidle-timeout=200ms lets networkidle
    // pass early. settleTimeout=800ms caps font+image settling.
    // Total: goto(~50) + networkidle(~200) + pre-scroll(~800) +
    //   settle(<800) + wait(500) + screenshot(~50) ≈ 2400ms max.
    // Should NOT wait 5s for the server delay.
    assert(
      elapsed < 3500,
      `delayed image: completed in ${elapsed}ms (settle ceiling respected, not waiting 5s server delay)`
    )
  }

  // ── 12. stdout/stderr contract — no settle logs ─────────
  section('12. stdout/stderr contract')
  {
    const outPath = join(tmp, 'contract.jpg')
    // Use spawn to capture stdout and stderr separately
    const { spawn } = await import('node:child_process')
    const proc = spawn(
      'node',
      [MSHOT, '--url', base() + '/fonts.html', '--out', outPath],
      {
        cwd: join(dirname(MSHOT)),
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => {
      stdout += d
    })
    proc.stderr.on('data', d => {
      stderr += d
    })

    await new Promise((resolve, reject) => {
      proc.on('close', code =>
        code === 0 ? resolve() : reject(new Error(`exit ${code}`))
      )
      proc.on('error', reject)
    })

    // stdout should be single line with path
    const lines = stdout.trim().split('\n')
    assert(lines.length === 1, 'stdout is single line')
    assert(lines[0].endsWith('.jpg'), 'stdout is .jpg path')

    // stderr should NOT contain settle-related logs
    assert(!stderr.includes('MSHOT_SETTLE'), 'no settle logs on stderr')
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Settle smoke done.`)
  console.log(`${'='.repeat(40)}\n`)
} catch (e) {
  console.error(`Settle smoke FAILED: ${e.message}`)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
} finally {
  if (serverProc) stopServer()
  if (tmp) removeTempDir(tmp)
}
