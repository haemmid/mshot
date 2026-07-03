#!/usr/bin/env node
// mshot — simple, stable full-page screenshot CLI
// Usage: mshot --url <url> --out <file> [options]
//
// Success:
//   stdout: /path/to/file.jpg
//   stderr: diagnostics
//   exit: 0
//
// Limited success (page taller than --max-height):
//   stdout: /path/to/file.jpg
//   stderr: contains MSHOT_LIMITED:
//   exit: 0
//
// Failure:
//   stdout: (empty)
//   stderr: starts with MSHOT_ERROR:
//   exit: non-zero

import { resolve, extname, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import {
  createWriteStream,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  readFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const VERSION = JSON.parse(
  readFileSync(new URL('package.json', import.meta.url), 'utf8')
).version

// ── Constants ─────────────────────────────────────────────
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
const DEFAULTS = {
  width: 1440,
  quality: 82,
  timeout: 30_000,
  wait: 500
}

// ── Helpers ───────────────────────────────────────────────
function error(message) {
  console.error(`MSHOT_ERROR: ${message}`)
  process.exitCode = 1
}

function fatal(message) {
  error(message)
  process.exit(1)
}

function showHelp() {
  console.log(`Usage:
  mshot --url <url> --out <file> [options]

Options:
  --url <url>             Page URL to capture (http:// or https://)
  --out <file>            Output .jpg, .jpeg, .png, or .webp path
  --width <px>            Viewport width, default ${DEFAULTS.width}
  --max-height <px>       Crop final image height, default none
  --quality <1-100>       JPEG/WebP quality, default ${DEFAULTS.quality}
  --timeout <ms>          Page load timeout, default ${DEFAULTS.timeout}
  --wait <ms>             Extra wait after load, default ${DEFAULTS.wait}
  --version
  --help`)
}

function showVersion() {
  console.log(VERSION)
}

// ── Parse args ────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    width: { type: 'string', default: String(DEFAULTS.width) },
    quality: { type: 'string', default: String(DEFAULTS.quality) },
    timeout: { type: 'string', default: String(DEFAULTS.timeout) },
    wait: { type: 'string', default: String(DEFAULTS.wait) },
    'max-height': { type: 'string' },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false }
  },
  allowPositionals: false,
  strict: true
})

if (values.help) {
  showHelp()
  process.exit(0)
}

if (values.version) {
  showVersion()
  process.exit(0)
}

// ── Validate required args ────────────────────────────────
if (!values.url) {
  fatal('--url is required')
}
if (!values.out) {
  fatal('--out is required')
}

// ── Validate URL ──────────────────────────────────────────
const url = values.url
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  fatal(
    `unsupported url protocol "${url.split(':', 1)[0]}"; use http:// or https://`
  )
}

// ── Validate output extension ─────────────────────────────
const outFile = resolve(values.out)
const extension = extname(outFile).toLowerCase()
if (!ALLOWED_EXTS.includes(extension)) {
  fatal(
    `unsupported output extension "${extension}"; use .jpg, .jpeg, .png, or .webp`
  )
}

const width = parseInt(values.width, 10)
const quality = parseInt(values.quality, 10)
const timeout = parseInt(values.timeout, 10)
const waitMs = parseInt(values.wait, 10)
const maxHeight = values['max-height']
  ? parseInt(values['max-height'], 10)
  : undefined

// Determine output format
const format =
  extension === '.webp' ? 'webp' : extension === '.png' ? 'png' : 'jpeg'

// ── Create output directory ───────────────────────────────
try {
  mkdirSync(dirname(outFile), { recursive: true })
} catch {
  fatal(`cannot create output directory: ${dirname(outFile)}`)
}

// ── Main ──────────────────────────────────────────────────
let temporaryFile = null
let browser = null

try {
  // 1. Launch browser
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  })

  const page = await context.newPage()

  // 2. Navigate + wait domcontentloaded
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout })

  // 3. Wait networkidle with a fallback timeout
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 })
  } catch {
    // proceed anyway
  }

  // 4. Extra wait for animations/layout
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs))
  }

  // 5. Full-page screenshot
  let buffer = await page.screenshot({
    fullPage: true,
    type: 'jpeg',
    quality
  })

  // 6. Check max-height — crop if needed
  let isLimited = false
  if (maxHeight !== undefined) {
    const pageHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
    )
    if (pageHeight > maxHeight) {
      isLimited = true
      console.error(
        `MSHOT_LIMITED: page height ${pageHeight}px, ` +
          `captured first ${maxHeight}px`
      )
      // Crop to maxHeight (cut bottom, don't scale)
      const { width: w, height: h } = await sharp(buffer).metadata()
      buffer = await sharp(buffer)
        .extract({
          left: 0,
          top: 0,
          width: w,
          height: Math.min(h, maxHeight)
        })
        .toBuffer()
    }
  }

  // 7. Convert to output format
  if (format === 'webp') {
    buffer = await sharp(buffer).webp({ quality }).toBuffer()
  } else if (format === 'png') {
    buffer = await sharp(buffer).png().toBuffer()
  } else {
    buffer = await sharp(buffer).jpeg({ quality }).toBuffer()
  }

  // 8. Atomic write: write to tmp, then rename
  temporaryFile = outFile + '.tmp-' + randomUUID()
  const stream = createWriteStream(temporaryFile)
  stream.write(buffer)
  stream.end()

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  renameSync(temporaryFile, outFile)
  temporaryFile = null // renamed, no cleanup needed

  if (isLimited) {
    console.error(
      `MSHOT_LIMITED: page was taller than --max-height` +
        ` (${statSync(outFile).size / 1024} KB)`
    )
  }

  // 9. stdout = path to file (only this, nothing else)
  process.stdout.write(outFile + '\n')
} catch (error_) {
  // Clean up tmp file on any failure
  if (temporaryFile) {
    try {
      unlinkSync(temporaryFile)
    } catch {}
  }
  // Clean error message on stderr
  const message = error_.message || String(error_)
  console.error(`MSHOT_ERROR: ${message}`)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
}
