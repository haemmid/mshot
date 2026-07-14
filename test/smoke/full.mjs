// test/smoke/full.mjs — full browser regression suite
// Usage: node test/smoke/full.mjs
//
// Covers all browser-dependent paths not covered by quick smoke.
// Single captures: formats, flags, edge cases.
// Batch captures: viewports, dedupe, depth, max-pages, max-height,
//                 networkidle, max-per-pattern, urls-file edge cases.

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import {
  runCli,
  runCliErr,
  createTempDir,
  removeTempDir,
  assert,
  assertExit,
  assertStdoutEmpty,
  assertStderrHas,
  assertFileExists,
  assertManifestHas,
  assertManifestVersion,
  MSHOT
} from './helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
let tmp = null

function section(name) {
  console.log(`\n${name}`)
}

try {
  tmp = createTempDir('full')

  // ── Single capture — formats ────────────────────────────
  section('1. single capture — WebP')
  {
    const outPath = join(tmp, 'webp.webp')
    const stdout = runCli(['--url', 'https://example.com', '--out', outPath])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.webp'), 'stdout = .webp path')
    assertFileExists(filePath, 'file exists')
    const buf = readFileSync(filePath)
    assert(buf[0] === 0x52 && buf[1] === 0x49, 'file is valid WebP (RIFF)')
  }

  section('2. single capture — PNG')
  {
    const outPath = join(tmp, 'png.png')
    const stdout = runCli(['--url', 'https://example.com', '--out', outPath])
    const filePath = stdout.trim()
    assert(filePath.endsWith('.png'), 'stdout = .png path')
    assertFileExists(filePath, 'file exists')
    const buf = readFileSync(filePath)
    assert(buf[0] === 0x89 && buf[1] === 0x50, 'file is valid PNG')
  }

  // ── Single capture — failure ────────────────────────────
  section('3. single capture — bad domain')
  {
    const r = runCliErr([
      '--url',
      'https://this-domain-does-not-exist-xyz.invalid',
      '--out',
      join(tmp, 'fail.jpg')
    ])
    assertExit(r.exitCode, 1, 'bad domain')
    assertStdoutEmpty(r.stdout, 'bad domain')
    assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'bad domain → error')
  }

  // ── Single capture — flags ──────────────────────────────
  section('4. single capture — --timeout')
  {
    const outPath = join(tmp, 'timeout.jpg')
    const stdout = runCli([
      '--url',
      'https://example.com',
      '--out',
      outPath,
      '--timeout',
      '10000'
    ])
    assert(stdout.trim().endsWith('.jpg'), '--timeout 10000 → success')
  }

  section('5. single capture — atomic write preserves stale')
  {
    const stalePath = join(tmp, 'stale.jpg')
    writeFileSync(stalePath, 'OLD_CONTENT')
    runCliErr([
      '--url',
      'https://this-domain-does-not-exist-xyz.invalid',
      '--out',
      stalePath
    ])
    const content = readFileSync(stalePath, 'utf8')
    assert(content === 'OLD_CONTENT', 'stale file preserved on fail')
  }

  section('6. single capture — auto-create output dir')
  {
    const deepPath = join(tmp, 'deep', 'nested', 'dir', 'snap.jpg')
    const stdout = runCli(['--url', 'https://example.com', '--out', deepPath])
    assert(stdout.trim() === deepPath, 'stdout = deep path')
    assertFileExists(deepPath, 'deep file exists')
  }

  section('7. single capture — --no-pre-scroll')
  {
    const outPath = join(tmp, 'nops.jpg')
    const stdout = runCli([
      '--url',
      'https://example.com',
      '--out',
      outPath,
      '--no-pre-scroll'
    ])
    assert(stdout.trim().endsWith('.jpg'), '--no-pre-scroll → success')
  }

  section('8. single capture — --width and --quality')
  {
    const outPath = join(tmp, 'small.jpg')
    const stdout = runCli([
      '--url',
      'https://example.com',
      '--out',
      outPath,
      '--width',
      '800',
      '--quality',
      '50'
    ])
    const filePath = stdout.trim()
    assertFileExists(filePath, 'custom width/quality → file exists')
    const s = statSync(filePath)
    assert(s.size < 50_000, 'low quality → smaller file')
  }

  section('9. single capture — --max-height')
  {
    const outPath = join(tmp, 'limited.jpg')
    const stdout = runCli([
      '--url',
      'https://en.wikipedia.org',
      '--out',
      outPath,
      '--max-height',
      '5000'
    ])
    assertFileExists(stdout.trim(), 'limited → file exists')
  }

  // ── Batch — basic ───────────────────────────────────────
  section('10. batch — basic (no discover)')
  {
    const batchDir = join(tmp, 'batch-basic')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assertManifestVersion(manifest, 'basic manifest')
    assert(manifest.pages.length === 1, 'manifest has 1 page')
    assert(manifest.pages[0].source === 'base', 'page source is base')
    assert(
      existsSync(join(batchDir, manifest.pages[0].screenshots.desktop)),
      'desktop screenshot exists'
    )
  }

  section('11. batch — with --discover')
  {
    const batchDir = join(tmp, 'batch-discover')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '5'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assertManifestHas(manifest, 1, 'discover pages')
    assert(manifest.pages[0].source === 'base', 'first page is base')
  }

  // ── Batch — viewports ───────────────────────────────────
  section('12. batch — multiple viewports')
  {
    const batchDir = join(tmp, 'batch-vp')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--viewports',
      'desktop,mobile'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
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

  // ── Batch — max-pages ───────────────────────────────────
  section('13. batch — --max-pages limit')
  {
    const batchDir = join(tmp, 'batch-max')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '1'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length === 1, 'only 1 page captured')
    assert(manifest.pages[0].source === 'base', 'only base page')
  }

  // ── Batch — max-height ──────────────────────────────────
  section('14. batch — --max-height')
  {
    const batchDir = join(tmp, 'batch-maxheight')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--max-height',
      '5000'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'pages captured with --max-height')
  }

  // ── Batch — stdout contract ─────────────────────────────
  section('15. batch — stdout contract')
  {
    const batchDir = join(tmp, 'batch-stdout')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const lines = stdout.trim().split('\n')
    assert(lines.length === 1, 'stdout is single line')
    assert(lines[0].endsWith('manifest.json'), 'stdout is manifest path')
  }

  // ── Batch — route dedupe ────────────────────────────────
  section('16. batch — route dedupe')
  {
    const batchDir = join(tmp, 'batch-dedupe')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '10'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'dedupe: at least 1 page')
    assert(typeof manifest.skipped === 'object', 'dedupe: skipped array exists')
  }

  section('17. batch — --no-route-dedupe')
  {
    const batchDir = join(tmp, 'batch-nodedupe')
    const stdout = runCli([
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
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'no-dedupe: at least 1 page')
  }

  // ── Batch — networkidle ─────────────────────────────────
  section('18. batch — --networkidle-timeout')
  {
    const batchDir = join(tmp, 'batch-netidle')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--networkidle-timeout',
      '2000'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'pages with custom timeout')
  }

  // ── Batch — max-per-pattern ─────────────────────────────
  section('19. batch — --max-per-pattern')
  {
    const batchDir = join(tmp, 'batch-mpp')
    const stdout = runCli([
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
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'max-per-pattern: at least 1 page')
  }

  // ── Batch — depth ───────────────────────────────────────
  section('20. batch — --depth 1')
  {
    const batchDir = join(tmp, 'batch-d1')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--depth',
      '1'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'depth 1: at least 1 page')
  }

  section('21. batch — --depth 2')
  {
    const batchDir = join(tmp, 'batch-d2')
    const stdout = runCli([
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
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'depth 2: at least 1 page')
  }

  // ── Batch — manifest timings ────────────────────────────
  section('22. batch — manifest timings')
  {
    const batchDir = join(tmp, 'batch-timing')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    const page = manifest.pages[0]
    assert(typeof page.timings === 'object', 'page has timings object')
    assert(
      page.timings.gotoMs !== undefined || page.timings.totalMs !== undefined,
      'timings include gotoMs or totalMs'
    )
  }

  // ── Batch — urls-file edge cases ────────────────────────
  section('23. batch — urls-file external URLs skipped')
  {
    const urlsFile = join(tmp, 'urls-ext.txt')
    writeFileSync(
      urlsFile,
      `/\nhttps://external.example/page\nhttp://other.com/foo\n`
    )
    const batchDir = join(tmp, 'batch-ext')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--urls-file',
      urlsFile,
      '--viewports',
      'desktop'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length > 0, 'external: valid page captured')
    assert(manifest.skipped.length >= 2, 'external: 2 skipped')
    assert(
      manifest.skipped.every(s => s.reason === 'external-origin'),
      'external: all skips are external-origin'
    )
  }

  section('24. batch — urls-file input not route-deduped')
  {
    const urlsFile = join(tmp, 'urls-dedup.txt')
    writeFileSync(urlsFile, `/project/a\n/project/b\n/project/c\n`)
    const batchDir = join(tmp, 'batch-dedup2')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--urls-file',
      urlsFile,
      '--viewports',
      'desktop'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length === 3, 'dedup: all 3 input URLs captured')
  }

  section('25. batch — urls-file + discover, input first')
  {
    const urlsFile = join(tmp, 'urls-disc.txt')
    writeFileSync(urlsFile, `/\n/about\n`)
    const batchDir = join(tmp, 'batch-disc')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--urls-file',
      urlsFile,
      '--discover',
      '--max-pages',
      '5',
      '--viewports',
      'desktop'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length >= 2, 'discover: at least 2 pages')
    assert(manifest.pages[0].source === 'input', 'first page is input')
    assert(manifest.pages[1].source === 'input', 'second page is input')
  }

  section('26. batch — urls-file + --max-pages overflow')
  {
    const urlsFile = join(tmp, 'urls-max.txt')
    writeFileSync(
      urlsFile,
      `/\n/about\n/contact\n/team\n` // 4 URLs
    )
    const batchDir = join(tmp, 'batch-maxoverflow')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--urls-file',
      urlsFile,
      '--max-pages',
      '2',
      '--viewports',
      'desktop'
    ])
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))
    assert(manifest.pages.length === 2, 'max-pages: only 2 captured')
    assert(manifest.skipped.length >= 2, 'max-pages: 2 skipped')
    assert(
      manifest.skipped.every(s => s.reason === 'max-pages'),
      'max-pages: skips have reason max-pages'
    )
  }

  // ── Batch — missing urls-file ───────────────────────────
  section('27. batch — missing urls-file')
  {
    const batchDir = join(tmp, 'batch-missing')
    const r = runCliErr([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--urls-file',
      '/tmp/does-not-exist-mshot-urls.txt'
    ])
    assertExit(r.exitCode, 1, 'missing urls-file')
    assertStdoutEmpty(r.stdout, 'missing urls-file')
    assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'missing urls-file → error')
    assertStderrHas(
      r.stderr,
      'urls-file not found',
      'missing urls-file → not found message'
    )
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Full regression smoke done.`)
  console.log(`${'='.repeat(40)}\n`)
} catch (e) {
  console.error(`Full smoke FAILED: ${e.message}`)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
} finally {
  if (tmp) removeTempDir(tmp)
}
