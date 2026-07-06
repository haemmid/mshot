// smoke tests — quick sanity checks for mshot CLI
// Usage: node test/smoke.mjs

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MSHOT = join(__dirname, '..', 'mshot.js')
const TMP = join(__dirname, '..', '.tmp-smoke')

const state = { passed: 0, failed: 0 }

function assert(condition, label) {
  if (condition) {
    state.passed++
    console.log(`  ✅ ${label}`)
  } else {
    state.failed++
    console.error(`  ❌ ${label}`)
  }
}

// ── Helpers ───────────────────────────────────────────────
function setup() {
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
}

function cleanup() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
}

function run(args) {
  const result = execFileSync('node', [MSHOT, ...args], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30_000
  })
  return result
}

function runErr(args) {
  try {
    const result = execFileSync('node', [MSHOT, ...args], {
      cwd: join(__dirname, '..'),
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

// ── Tests ─────────────────────────────────────────────────
async function main() {
  setup()

  // ── 1. --help / --version ───────────────────────────────
  console.log('\n1. --help / --version')
  {
    try {
      execFileSync('node', [MSHOT, '--help'], {
        cwd: join(__dirname, '..'),
        timeout: 5000
      })
      assert(true, '--help exits 0')
    } catch {
      assert(false, '--help exits 0')
    }
    const out = execFileSync('node', [MSHOT, '--version'], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 5000
    }).trim()
    assert(out.startsWith('0.'), `--version prints ${out}`)
  }

  // ── 2. missing required args ────────────────────────────
  console.log('\n2. missing required args')
  {
    const r = runErr(['--out', '/tmp/x.jpg'])
    assert(r.exitCode !== 0, 'missing --url → exit 1')
    assert(r.stderr.includes('MSHOT_ERROR'), 'missing --url → MSHOT_ERROR')
  }
  {
    const r = runErr(['--url', 'https://example.com'])
    assert(r.exitCode !== 0, 'missing --out → exit 1')
    assert(r.stderr.includes('MSHOT_ERROR'), 'missing --out → MSHOT_ERROR')
  }

  // ── 3. invalid url ──────────────────────────────────────
  console.log('\n3. invalid url')
  {
    const r = runErr(['--url', 'file:///tmp/x', '--out', '/tmp/x.jpg'])
    assert(r.exitCode !== 0, 'file:// url → exit 1')
    assert(r.stderr.includes('MSHOT_ERROR'), 'file:// url → MSHOT_ERROR')
  }

  // ── 4. invalid extension ────────────────────────────────
  console.log('\n4. invalid extension')
  {
    const r = runErr(['--url', 'https://example.com', '--out', '/tmp/x.gif'])
    assert(r.exitCode !== 0, '.gif → exit 1')
    assert(r.stderr.includes('MSHOT_ERROR'), '.gif → MSHOT_ERROR')
  }
  {
    const r = runErr(['--url', 'https://example.com', '--out', '/tmp/noext'])
    assert(r.exitCode !== 0, 'no ext → exit 1')
    assert(r.stderr.includes('MSHOT_ERROR'), 'no ext → MSHOT_ERROR')
  }

  // ── 5. success — JPEG ───────────────────────────────────
  console.log('\n5. success — JPEG')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 's1.jpg')
    ])
    const filePath = out.trim()
    assert(filePath.endsWith('.jpg'), 'stdout = path to .jpg')
    assert(existsSync(filePath), 'file exists')
    const content = readFileSync(filePath)
    assert(content[0] === 0xff && content[1] === 0xd8, 'file is valid JPEG')
    assert(content.length > 1000, 'file has reasonable size')
  }

  // ── 6. success — WebP ───────────────────────────────────
  console.log('\n6. success — WebP')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 's2.webp')
    ])
    const filePath = out.trim()
    assert(filePath.endsWith('.webp'), 'stdout = path to .webp')
    assert(existsSync(filePath), 'file exists')
    const content = readFileSync(filePath)
    assert(
      content[0] === 0x52 && content[1] === 0x49,
      'file is valid WebP (RIFF)'
    )
  }

  // ── 7. success — PNG ────────────────────────────────────
  console.log('\n7. success — PNG')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 's3.png')
    ])
    const filePath = out.trim()
    assert(filePath.endsWith('.png'), 'stdout = path to .png')
    assert(existsSync(filePath), 'file exists')
    const content = readFileSync(filePath)
    assert(content[0] === 0x89 && content[1] === 0x50, 'file is valid PNG')
  }

  // ── 8. fail — bad domain ────────────────────────────────
  console.log('\n8. fail — bad domain')
  {
    const r = runErr([
      '--url',
      'https://this-domain-does-not-exist-xyz.invalid',
      '--out',
      join(TMP, 'fail.jpg')
    ])
    assert(r.exitCode !== 0, 'bad domain → exit 1')
    assert(r.stdout.trim() === '', 'bad domain → stdout empty')
    assert(
      r.stderr.includes('MSHOT_ERROR'),
      'bad domain → MSHOT_ERROR in stderr'
    )
  }

  // ── 9. --timeout ────────────────────────────────────────
  console.log('\n9. --timeout')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 'timeout.jpg'),
      '--timeout',
      '10000'
    ])
    assert(out.trim().endsWith('.jpg'), '--timeout 10000 → success')
  }

  // ── 10. atomic write — stale file preserved on fail ─────
  console.log('\n10. atomic write — stale file')
  {
    const stalePath = join(TMP, 'stale.jpg')
    writeFileSync(stalePath, 'OLD_CONTENT')
    runErr([
      '--url',
      'https://this-domain-does-not-exist-xyz.invalid',
      '--out',
      stalePath
    ])
    const content = readFileSync(stalePath, 'utf8')
    assert(content === 'OLD_CONTENT', 'stale file preserved on fail')
  }

  // ── 11. auto-create output dir ──────────────────────────
  console.log('\n11. auto-create output dir')
  {
    const deepPath = join(TMP, 'deep', 'nested', 'dir', 'snap.jpg')
    const out = run(['--url', 'https://example.com', '--out', deepPath])
    assert(out.trim() === deepPath, 'stdout = deep path')
    assert(existsSync(deepPath), 'deep file exists')
  }

  // ── 12. --no-pre-scroll ─────────────────────────────────
  console.log('\n12. --no-pre-scroll')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 'nops.jpg'),
      '--no-pre-scroll'
    ])
    assert(out.trim().endsWith('.jpg'), '--no-pre-scroll → success')
  }

  // ── 13. --width and --quality ───────────────────────────
  console.log('\n13. --width and --quality')
  {
    const out = run([
      '--url',
      'https://example.com',
      '--out',
      join(TMP, 'small.jpg'),
      '--width',
      '800',
      '--quality',
      '50'
    ])
    const filePath = out.trim()
    assert(existsSync(filePath), 'custom width/quality → file exists')
    const s = statSync(filePath)
    assert(s.size < 50_000, 'low quality → smaller file')
  }

  // ── 14. --max-height (limited) ──────────────────────────
  console.log('\n14. --max-height (limited)')
  {
    const out = run([
      '--url',
      'https://en.wikipedia.org',
      '--out',
      join(TMP, 'limited.jpg'),
      '--max-height',
      '5000'
    ])
    const filePath = out.trim()
    assert(existsSync(filePath), 'limited → file exists')
  }

  // ── Batch mode tests ────────────────────────────────────

  // ── 15. batch --help ────────────────────────────────────
  console.log('\n15. batch --help')
  {
    try {
      execFileSync('node', [MSHOT, 'batch', '--help'], {
        cwd: join(__dirname, '..'),
        timeout: 5000
      })
      assert(true, 'batch --help exits 0')
    } catch {
      assert(false, 'batch --help exits 0')
    }
  }

  // ── 16. batch missing --out-dir ─────────────────────────
  console.log('\n16. batch missing --out-dir')
  {
    const r = runErr(['batch', '--url', 'https://example.com'])
    assert(r.exitCode !== 0, 'batch missing --out-dir → exit 1')
    assert(
      r.stderr.includes('MSHOT_ERROR'),
      'batch missing --out-dir → MSHOT_ERROR'
    )
    assert(r.stdout.trim() === '', 'batch missing --out-dir → stdout empty')
  }

  // ── 17. batch missing --url ─────────────────────────────
  console.log('\n17. batch missing --url')
  {
    const r = runErr(['batch', '--out-dir', join(TMP, 'batch1')])
    assert(r.exitCode !== 0, 'batch missing --url → exit 1')
    assert(
      r.stderr.includes('MSHOT_ERROR'),
      'batch missing --url → MSHOT_ERROR'
    )
  }

  // ── 18. batch without --discover ────────────────────────
  console.log('\n18. batch without --discover')
  {
    const batchDir = join(TMP, 'batch1')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const manifestPath = out.trim()
    assert(manifestPath.endsWith('manifest.json'), 'stdout = manifest path')
    assert(existsSync(manifestPath), 'manifest exists')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert(manifest.pages.length === 1, 'manifest has 1 page')
    assert(manifest.pages[0].source === 'base', 'page source is base')
    assert(
      existsSync(join(batchDir, manifest.pages[0].screenshots.desktop)),
      'desktop screenshot exists'
    )
  }

  // ── 19. batch with --discover ───────────────────────────
  console.log('\n19. batch with --discover')
  {
    const batchDir = join(TMP, 'batch2')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '5'
    ])
    const manifestPath = out.trim()
    assert(manifestPath.endsWith('manifest.json'), 'stdout = manifest path')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert(manifest.pages.length > 0, 'manifest has at least 1 page')
    assert(manifest.pages[0].source === 'base', 'first page is base')
  }

  // ── 20. batch --viewports desktop,mobile ────────────────
  console.log('\n20. batch --viewports desktop,mobile')
  {
    const batchDir = join(TMP, 'batch3')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--viewports',
      'desktop,mobile'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    const page = manifest.pages[0]
    assert(page.screenshots.desktop, 'has desktop screenshot')
    assert(page.screenshots.mobile, 'has mobile screenshot')
    assert(
      existsSync(join(batchDir, page.screenshots.desktop)),
      'desktop file exists'
    )
    assert(
      existsSync(join(batchDir, page.screenshots.mobile)),
      'mobile file exists'
    )
  }

  // ── 21. batch --max-pages 1 ─────────────────────────────
  console.log('\n21. batch --max-pages 1')
  {
    const batchDir = join(TMP, 'batch4')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '1'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length === 1, 'manifest has 1 page')
    assert(manifest.pages[0].source === 'base', 'only base page')
  }

  // ── 22. batch --max-height with batch ───────────────────
  console.log('\n22. batch --max-height')
  {
    const batchDir = join(TMP, 'batch5')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--max-height',
      '5000'
    ])
    const manifestPath = out.trim()
    assert(existsSync(manifestPath), 'manifest exists with --max-height')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert(manifest.pages.length > 0, 'pages captured with --max-height')
  }

  // ── 23. batch stdout contract ───────────────────────────
  console.log('\n23. batch stdout contract')
  {
    const batchDir = join(TMP, 'batch6')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const lines = out.trim().split('\n')
    assert(lines.length === 1, 'stdout is single line')
    assert(lines[0].endsWith('manifest.json'), 'stdout is manifest path')
  }

  // ── 24. batch route dedupe ──────────────────────────────
  console.log('\n24. batch route dedupe')
  {
    const batchDir = join(TMP, 'batch7')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '10'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'dedupe: at least 1 page')
    assert(typeof manifest.skipped === 'object', 'dedupe: skipped array exists')
  }

  // ── 25. batch --no-route-dedupe ─────────────────────────
  console.log('\n25. batch --no-route-dedupe')
  {
    const batchDir = join(TMP, 'batch8')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '10',
      '--no-route-dedupe'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'no-dedupe: at least 1 page')
  }

  // ── 26. batch --networkidle-timeout ─────────────────────
  console.log('\n26. batch --networkidle-timeout')
  {
    const batchDir = join(TMP, 'batch9')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--networkidle-timeout',
      '2000'
    ])
    const manifestPath = out.trim()
    assert(existsSync(manifestPath), 'manifest exists with custom timeout')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert(manifest.pages.length > 0, 'pages captured with custom timeout')
  }

  // ── 27. batch --max-per-pattern ─────────────────────────
  console.log('\n27. batch --max-per-pattern')
  {
    const batchDir = join(TMP, 'batch10')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '10',
      '--max-per-pattern',
      '2'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'max-per-pattern: at least 1 page')
  }

  // ── 28. batch --depth 1 ─────────────────────────────────
  console.log('\n28. batch --depth 1')
  {
    const batchDir = join(TMP, 'batch11')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--depth',
      '1'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'depth 1: at least 1 page')
  }

  // ── 29. batch --depth 2 ─────────────────────────────────
  console.log('\n29. batch --depth 2')
  {
    const batchDir = join(TMP, 'batch12')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--depth',
      '2',
      '--max-pages',
      '5'
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'depth 2: at least 1 page')
  }

  // ── 30. manifest timings ────────────────────────────────
  console.log('\n30. manifest timings')
  {
    const batchDir = join(TMP, 'batch13')
    const out = run([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const manifest = JSON.parse(readFileSync(out.trim(), 'utf8'))
    const page = manifest.pages[0]
    assert(typeof page.timings === 'object', 'manifest page has timings object')
    assert(
      page.timings.gotoMs !== undefined || page.timings.totalMs !== undefined,
      'timings include at least gotoMs or totalMs'
    )
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
  console.log(`${'='.repeat(40)}\n`)

  cleanup()
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(state.failed > 0 ? 1 : 0)
}

try {
  await main()
} catch (e) {
  console.error('Smoke test crash:', e.message)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
}
