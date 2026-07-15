#!/usr/bin/env node
// mshot — simple, stable full-page screenshot CLI
// Usage:
//   mshot --url <url> --out <file> [options]
//   mshot batch --url <url> --out-dir <dir> [options]

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

import {
  parseArgsConfig,
  showHelp,
  DEFAULTS,
  USER_AGENT,
  validateSingle,
  validateBatch
} from './lib/options.js'
import { capturePage } from './lib/capture.js'
import { createOutputDir, writeBuffer } from './lib/output.js'
import { runBatch } from './lib/batch.js'

// Playwright page.screenshot() internally waits for document.fonts.ready,
// which is unbounded when a slow <img> or <font> request is pending.
// mshot already performs its own bounded settle wait (fonts + images),
// so this compatibility flag bypasses the duplicate unbounded wait.
// Regression-tested with slow-resource fixtures.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'

const VERSION = JSON.parse(
  readFileSync(new URL('package.json', import.meta.url), 'utf8')
).version

// ── Helpers ───────────────────────────────────────────────
function fatal(message) {
  console.error(`MSHOT_ERROR: ${message}`)
  process.exit(1)
}

// ── Parse ─────────────────────────────────────────────────
const { values, positionals } = parseArgs(parseArgsConfig())

if (values.help) {
  showHelp()
  process.exit(0)
}
if (values.version) {
  showVersion()
  process.exit(0)
}

const mode = positionals[0] === 'batch' ? 'batch' : 'single'

if (!values.url) fatal('--url is required')
if (mode === 'batch' && !values['out-dir'])
  fatal('--out-dir is required for batch mode')
if (mode === 'single' && !values.out) fatal('--out is required')

if (!values.url.startsWith('http://') && !values.url.startsWith('https://')) {
  fatal(
    `unsupported url protocol "${values.url.split(':', 1)[0]}"; use http:// or https://`
  )
}

// ── Dispatch ──────────────────────────────────────────────
try {
  if (mode === 'single') await runSingle(values)
  else await runBatchMode(values)
} catch (err) {
  const message = err.message || String(err)
  console.error(`MSHOT_ERROR: ${message}`)
  process.exitCode = 1
}

// ── Single mode ───────────────────────────────────────────
async function runSingle(values) {
  const parsed = validateSingle(values)
  if (parsed.error) fatal(parsed.error)

  const {
    outFile,
    format,
    width,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled
  } = parsed

  if (!createOutputDir(resolve(outFile).split('/').slice(0, -1).join('/'))) {
    fatal(
      `cannot create output directory: ${resolve(outFile).split('/').slice(0, -1).join('/')}`
    )
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent: USER_AGENT
    })
    const page = await context.newPage()

    const { buffer } = await capturePage(page, {
      url: values.url,
      format,
      quality,
      timeout,
      waitMs,
      maxHeight,
      isPreScrollEnabled,
      isSettleEnabled: parsed.isSettleEnabled,
      settleTimeout: parsed.settleTimeout,
      networkidleTimeout: parsed.networkidleTimeout
    })

    const result = await writeBuffer(buffer, outFile)
    if (!result) throw new Error('failed to write output file')

    process.stdout.write(outFile + '\n')
  } finally {
    await browser.close()
  }
}

// ── Batch mode ────────────────────────────────────────────
async function runBatchMode(values) {
  const parsed = validateBatch(values)
  if (parsed.error) fatal(parsed.error)

  const batchOpts = {
    url: values.url,
    outDir: parsed.outDir,
    quality: parsed.quality,
    timeout: parsed.timeout,
    waitMs: parsed.waitMs,
    maxHeight: parsed.maxHeight,
    isPreScrollEnabled: parsed.isPreScrollEnabled,
    isSettleEnabled: parsed.isSettleEnabled,
    settleTimeout: parsed.settleTimeout,
    networkidleTimeout: parsed.networkidleTimeout,
    discover: parsed.discover,
    maxPages: parsed.maxPages,
    concurrency: parsed.concurrency,
    viewports: parsed.viewports,
    routeDedupe: parsed.routeDedupe,
    maxPerPattern: parsed.maxPerPattern,
    depth: parsed.depth,
    urlsFile: parsed.urlsFile
  }

  const result = await runBatch(batchOpts)
  if (result.error) fatal(result.error)

  process.stdout.write(result.manifestPath + '\n')
}

function showVersion() {
  console.log(VERSION)
}
