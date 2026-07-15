// test/package/smoke.mjs — package/installation smoke test
// Usage: node test/package/smoke.mjs
//
// 1. npm pack
// 2. Create temp dir, install tgz
// 3. Check mshot --version
// 4. Check lib/ is loadable
// 5. Run single capture
// 6. Run batch capture
// 7. Cleanup

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
  readdirSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

let tmp = null

function section(name) {
  console.log(`\n${name}`)
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    throw new Error(`Assertion failed: ${label}`)
  }
}

try {
  // ── 1. npm pack ─────────────────────────────────────────
  section('1. npm pack')
  {
    const packResult = execFileSync('npm', ['pack'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000
    })
    const lines = packResult.trim().split('\n')
    const tgzFile = lines.at(-1).trim()
    assert(existsSync(tgzFile), `tgz created: ${tgzFile}`)
  }

  // ── 2. Create temp dir and install ──────────────────────
  section('2. install tgz into temp dir')
  {
    tmp = join(dirname(ROOT), `.tmp-package-test-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })

    // Find the tgz file
    const tgzFiles = readdirSync(ROOT).filter(f => f.endsWith('.tgz'))
    assert(tgzFiles.length === 1, 'exactly one .tgz file')
    const tgzPath = join(ROOT, tgzFiles[0])

    execFileSync('npm', ['install', tgzPath], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60_000
    })

    assert(
      existsSync(join(tmp, 'node_modules', 'mshot', 'mshot.js')),
      'mshot binary installed'
    )
    assert(
      existsSync(join(tmp, 'node_modules', 'mshot', 'lib')),
      'mshot/lib/ installed'
    )
  }

  // ── 3. Check version ────────────────────────────────────
  section('3. mshot --version')
  {
    const mshotBin = join(tmp, 'node_modules', 'mshot', 'mshot.js')
    const version = execFileSync('node', [mshotBin, '--version'], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 5000
    }).trim()
    assert(version.startsWith('0.'), `version: ${version}`)
  }

  // ── 4. Check lib/ modules loadable ──────────────────────
  section('4. lib/ modules loadable')
  {
    const mshotPkg = join(tmp, 'node_modules', 'mshot')
    const libDir = join(mshotPkg, 'lib')
    const files = readdirSync(libDir)
    assert(files.length > 0, `lib/ has ${files.length} files`)
    assert(files.includes('options.js'), 'options.js present')
    assert(files.includes('capture.js'), 'capture.js present')
    assert(files.includes('batch.js'), 'batch.js present')
    assert(files.includes('manifest.js'), 'manifest.js present')
    assert(files.includes('output.js'), 'output.js present')
    assert(files.includes('route-patterns.js'), 'route-patterns.js present')
    assert(files.includes('url-list.js'), 'url-list.js present')
  }

  // ── 5. Single capture ───────────────────────────────────
  section('5. single capture from installed package')
  {
    const mshotBin = join(tmp, 'node_modules', 'mshot', 'mshot.js')
    const outPath = join(tmp, 'pkg-single.jpg')
    const stdout = execFileSync(
      'node',
      [mshotBin, '--url', 'https://example.com', '--out', outPath],
      {
        cwd: tmp,
        encoding: 'utf8',
        timeout: 30_000
      }
    )
    const filePath = stdout.trim()
    assert(filePath.endsWith('.jpg'), 'stdout = .jpg path')
    assert(existsSync(filePath), 'file exists')
    const buf = readFileSync(filePath)
    assert(buf[0] === 0xff && buf[1] === 0xd8, 'file is valid JPEG')
  }

  // ── 6. Batch capture ────────────────────────────────────
  section('6. batch capture from installed package')
  {
    const mshotBin = join(tmp, 'node_modules', 'mshot', 'mshot.js')
    const batchDir = join(tmp, 'pkg-batch')
    const stdout = execFileSync(
      'node',
      [
        mshotBin,
        'batch',
        '--url',
        'https://example.com',
        '--out-dir',
        batchDir
      ],
      {
        cwd: tmp,
        encoding: 'utf8',
        timeout: 30_000
      }
    )
    const manifestPath = stdout.trim()
    assert(manifestPath.endsWith('manifest.json'), 'stdout = manifest path')
    assert(existsSync(manifestPath), 'manifest exists')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert(manifest.manifestVersion === 1, 'manifestVersion === 1')
    assert(manifest.pages.length > 0, 'at least 1 page captured')
    assert(
      existsSync(join(batchDir, manifest.pages[0].screenshots.desktop)),
      'desktop screenshot exists'
    )
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Package smoke passed.`)
  console.log(`${'='.repeat(40)}\n`)
} catch (e) {
  console.error(`Package smoke FAILED: ${e.message}`)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
} finally {
  // Cleanup
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true })
    console.log(`Cleaned up ${tmp}`)
  }
  // Remove tgz
  try {
    const tgzFiles = readdirSync(ROOT).filter(f => f.endsWith('.tgz'))
    for (const f of tgzFiles) {
      rmSync(join(ROOT, f))
    }
  } catch {}
}
