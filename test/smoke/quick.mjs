// test/smoke/quick.mjs — representative CLI contract + minimal browser smoke
// Usage: node test/smoke/quick.mjs
//
// Covers: --help, --version, validation failures, single capture,
//         batch capture, urls-file integration.
// Target: ~5 Chromium launches, ~10–20 seconds.

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  tmp = createTempDir('quick')

  // ── 1. --help / --version (no browser) ──────────────────
  section('1. --help / --version')
  {
    try {
      runCli(['--help'])
      assert(true, '--help exits 0')
    } catch {
      assert(false, '--help exits 0')
    }
    const version = runCli(['--version']).trim()
    assert(version.startsWith('0.'), `--version prints ${version}`)
  }

  // ── 2. validation failures (no browser) ─────────────────
  section('2. validation failures')
  {
    // Missing --url
    {
      const r = runCliErr(['--out', join(tmp, 'x.jpg')])
      assertExit(r.exitCode, 1, 'missing --url')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'missing --url → error')
      assertStdoutEmpty(r.stdout, 'missing --url')
    }

    // Missing --out
    {
      const r = runCliErr(['--url', 'https://example.com'])
      assertExit(r.exitCode, 1, 'missing --out')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'missing --out → error')
    }

    // Invalid URL protocol
    {
      const r = runCliErr([
        '--url',
        'file:///tmp/x',
        '--out',
        join(tmp, 'x.jpg')
      ])
      assertExit(r.exitCode, 1, 'file:// url')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'file:// → error')
    }

    // Invalid extension
    {
      const r = runCliErr([
        '--url',
        'https://example.com',
        '--out',
        join(tmp, 'x.gif')
      ])
      assertExit(r.exitCode, 1, '.gif extension')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', '.gif → error')
    }

    // Batch missing --out-dir
    {
      const r = runCliErr(['batch', '--url', 'https://example.com'])
      assertExit(r.exitCode, 1, 'batch missing out-dir')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'batch → error')
    }

    // Batch missing --url
    {
      const r = runCliErr(['batch', '--out-dir', join(tmp, 'batch')])
      assertExit(r.exitCode, 1, 'batch missing url')
      assertStderrHas(r.stderr, 'MSHOT_ERROR:', 'batch → error')
    }
  }

  // ── 3. single capture (1 Chromium) ──────────────────────
  section('3. single capture')
  {
    const outPath = join(tmp, 'single.jpg')
    const stdout = runCli(['--url', 'https://example.com', '--out', outPath])
    const filePath = stdout.trim()

    assert(filePath.endsWith('.jpg'), 'stdout = .jpg path')
    assertFileExists(filePath, 'file exists')

    const { readFileSync } = await import('node:fs')
    const buf = readFileSync(filePath)
    assert(buf[0] === 0xff && buf[1] === 0xd8, 'file is valid JPEG')
    assert(buf.length > 1000, 'file has reasonable size')
  }

  // ── 4. batch capture (1 Chromium) ───────────────────────
  section('4. batch capture')
  {
    const batchDir = join(tmp, 'batch')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir
    ])
    const manifestPath = stdout.trim()

    assert(manifestPath.endsWith('manifest.json'), 'stdout = manifest path')
    assertFileExists(manifestPath, 'manifest exists')

    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    assertManifestVersion(manifest, 'batch manifest')
    assertManifestHas(manifest, 1, 'batch manifest pages')
    assert(manifest.pages[0].source === 'base', 'page source is base')

    const screenshotPath = join(batchDir, manifest.pages[0].screenshots.desktop)
    assertFileExists(screenshotPath, 'desktop screenshot exists')

    // stdout is single line
    const lines = stdout.trim().split('\n')
    assert(lines.length === 1, 'stdout is single line')
  }

  // ── 5. batch with --urls-file (1 Chromium) ──────────────
  section('5. batch with --urls-file')
  {
    const { writeFileSync } = await import('node:fs')
    const urlsFile = join(tmp, 'urls.txt')
    writeFileSync(urlsFile, `/\n# important pages\n/settings\n/about\n`)

    const batchDir = join(tmp, 'batch-urls')
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

    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))

    assertManifestHas(manifest, 3, 'urls-file pages')
    const sources = manifest.pages.map(p => p.source)
    assert(
      sources.every(s => s === 'input'),
      'all pages source=input'
    )
  }

  // ── 6. partial failure — bad domain in batch (1 Chromium) ──
  section('6. batch partial failure')
  {
    const batchDir = join(tmp, 'batch-fail')
    const stdout = runCli([
      'batch',
      '--url',
      'https://example.com',
      '--out-dir',
      batchDir,
      '--discover',
      '--max-pages',
      '2'
    ])

    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(stdout.trim(), 'utf8'))

    assertManifestHas(manifest, 1, 'partial failure: at least 1 page')
    assert(manifest.pages[0].source === 'base', 'base page captured')
  }

  // ── Summary ─────────────────────────────────────────────
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Quick smoke done. Run "npm run test:full" for full regression.`)
  console.log(`${'='.repeat(40)}\n`)
} catch (e) {
  console.error(`Quick smoke FAILED: ${e.message}`)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
} finally {
  if (tmp) removeTempDir(tmp)
}
