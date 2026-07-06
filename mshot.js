#!/usr/bin/env node
// mshot — simple, stable full-page screenshot CLI
// Usage:
//   mshot --url <url> --out <file> [options]
//   mshot batch --url <url> --out-dir <dir> [options]
//
// Single mode contract:
//   Success:
//     stdout: /path/to/file.jpg
//     stderr: diagnostics
//     exit: 0
//   Limited success (page taller than --max-height):
//     stdout: /path/to/file.jpg
//     stderr: contains MSHOT_LIMITED:
//     exit: 0
//   Failure:
//     stdout: (empty)
//     stderr: starts with MSHOT_ERROR:
//     exit: non-zero
//
// Batch mode contract:
//   Success (≥1 page captured):
//     stdout: /path/to/manifest.json
//     stderr: diagnostics/warnings
//     exit: 0
//   Failure (0 pages captured or invalid args):
//     stdout: (empty)
//     stderr: starts with MSHOT_ERROR:
//     exit: non-zero

import { resolve, extname, dirname, relative, join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import {
  createWriteStream,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const VERSION = JSON.parse(
  readFileSync(new URL('package.json', import.meta.url), 'utf8')
).version

// ── Manifest pages collector (batch mode) ─────────────────
const manifestPages = []

// ── Constants ─────────────────────────────────────────────
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
const SCROLL = {
  stepRatio: 0.8,
  delayMs: 150,
  maxPasses: 1,
  maxHeight: 30_000,
  imageTimeout: 2000
}
const DEFAULTS = {
  width: 1440,
  quality: 82,
  timeout: 30_000,
  wait: 500
}
const VIEWPORTS = {
  desktop: { width: 1440 },
  mobile: { width: 390 }
}

// ── Helpers ───────────────────────────────────────────────
function warn(message) {
  console.error(`MSHOT_WARN: ${message}`)
}

function error(message) {
  console.error(`MSHOT_ERROR: ${message}`)
  process.exitCode = 1
}

function fatal(message) {
  error(message)
  process.exit(1)
}

// ── Help ──────────────────────────────────────────────────
function showHelp() {
  console.log(`Usage:
  mshot --url <url> --out <file> [options]
  mshot batch --url <url> --out-dir <dir> [options]

Commands:
  batch     Capture multiple pages (discover links, multiple viewports)

Single-mode Options:
  --url <url>             Page URL to capture (http:// or https://)
  --out <file>            Output .jpg, .jpeg, .png, or .webp path
  --width <px>            Viewport width, default ${DEFAULTS.width}
  --max-height <px>       Crop final image height, default none
  --quality <1-100>       JPEG/WebP quality, default ${DEFAULTS.quality}
  --timeout <ms>          Page load timeout, default ${DEFAULTS.timeout}
  --wait <ms>             Extra wait after load, default ${DEFAULTS.wait}
  --no-pre-scroll         Skip pre-scroll stabilization

Batch Options:
  --url <url>             Base URL to capture and discover links
  --out-dir <dir>         Output directory for screenshots and manifest
  --viewports <list>      Viewports to capture (comma-separated), default desktop
                          supported: desktop (1440px), mobile (390px)
  --discover              Discover rendered <a> links from base page
  --max-pages <n>         Max pages to capture, default ${DEFAULTS.width}
  --concurrency <n>       Max concurrent captures, default 2

  --version
  --help`)
}

function showVersion() {
  console.log(VERSION)
}

// ── Parse args ────────────────────────────────────────────
const { values, positionals } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    'out-dir': { type: 'string' },
    width: { type: 'string', default: String(DEFAULTS.width) },
    quality: { type: 'string', default: String(DEFAULTS.quality) },
    timeout: { type: 'string', default: String(DEFAULTS.timeout) },
    wait: { type: 'string', default: String(DEFAULTS.wait) },
    'max-height': { type: 'string' },
    'pre-scroll': { type: 'boolean', default: true },
    'no-pre-scroll': { type: 'boolean', default: false },
    viewports: { type: 'string' },
    discover: { type: 'boolean', default: false },
    'max-pages': { type: 'string' },
    concurrency: { type: 'string' },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false }
  },
  allowPositionals: true,
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

// ── Detect mode ───────────────────────────────────────────
const mode = positionals[0] === 'batch' ? 'batch' : 'single'

// ── Validate required args ────────────────────────────────
if (!values.url) {
  fatal('--url is required')
}

if (mode === 'batch') {
  const outDirVal = values['out-dir'] || values.outDir
  if (!outDirVal) {
    fatal('--out-dir is required for batch mode')
  }
} else {
  if (!values.out) {
    fatal('--out is required')
  }
}

// ── Validate URL ──────────────────────────────────────────
const url = values.url
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  fatal(
    `unsupported url protocol "${url.split(':', 1)[0]}"; use http:// or https://`
  )
}

// ── Single mode ───────────────────────────────────────────
if (mode === 'single') {
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
  const isPreScrollEnabled = !values['no-pre-scroll'] && values['pre-scroll']
  const format =
    extension === '.webp' ? 'webp' : extension === '.png' ? 'png' : 'jpeg'

  // ── Create output directory ───────────────────────────
  try {
    mkdirSync(dirname(outFile), { recursive: true })
  } catch {
    fatal(`cannot create output directory: ${dirname(outFile)}`)
  }

  // ── Run single capture ────────────────────────────────
  await runSingleCapture({
    url,
    outFile,
    format,
    width,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled
  })
}

// ── Batch mode ────────────────────────────────────────────
else if (mode === 'batch') {
  await runBatchMode(values)
}

// ── Shared screenshot logic ───────────────────────────────
async function runSingleCapture({
  url,
  outFile,
  format,
  width,
  quality,
  timeout,
  waitMs,
  maxHeight,
  isPreScrollEnabled
}) {
  let temporaryFile = null
  let browser = null

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    })

    const page = await context.newPage()
    const buffer = await capturePage(page, {
      url,
      format,
      quality,
      timeout,
      waitMs,
      maxHeight,
      isPreScrollEnabled
    })

    // Atomic write
    temporaryFile = outFile + '.tmp-' + randomUUID()
    const stream = createWriteStream(temporaryFile)
    stream.write(buffer)
    stream.end()

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    renameSync(temporaryFile, outFile)
    temporaryFile = null

    process.stdout.write(outFile + '\n')
  } catch (error_) {
    if (temporaryFile) {
      try {
        unlinkSync(temporaryFile)
      } catch {}
    }
    const message = error_.message || String(error_)
    console.error(`MSHOT_ERROR: ${message}`)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close()
  }
}

// ── Batch mode implementation ─────────────────────────────
async function runBatchMode(values) {
  const outDir = resolve(values['out-dir'])
  const quality = parseInt(values.quality, 10)
  const timeout = parseInt(values.timeout, 10)
  const waitMs = parseInt(values.wait, 10)
  const maxHeight = values['max-height']
    ? parseInt(values['max-height'], 10)
    : undefined
  const isPreScrollEnabled = !values['no-pre-scroll'] && values['pre-scroll']
  const discover = values.discover
  const maxPages = parseInt(values['max-pages'], 10) || 12
  const concurrency = parseInt(values.concurrency, 10) || 2

  // Parse viewports
  const viewportNames = values.viewports
    ? values.viewports.split(',').map(v => v.trim().toLowerCase())
    : ['desktop']

  const activeViewports = []
  for (const name of viewportNames) {
    const vp = VIEWPORTS[name]
    if (!vp) {
      fatal(
        `unknown viewport "${name}"; supported: ${Object.keys(VIEWPORTS).join(', ')}`
      )
    }
    activeViewports.push({ name, ...vp })
  }

  // Create output directory
  try {
    mkdirSync(outDir, { recursive: true })
  } catch {
    fatal(`cannot create output directory: ${outDir}`)
  }

  // Collect pages to capture — base URL first
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
  const discoveredLinks = discover ? await discoverLinks(baseUrl, timeout) : []
  const pagesToCapture = [{ url: baseUrl, source: 'base' }]
  for (const link of discoveredLinks) {
    if (pagesToCapture.length >= maxPages) break
    pagesToCapture.push({ url: link, source: 'rendered-link' })
  }

  // Launch browser once
  let browser = null
  let captured = 0
  const manifestSkipped = []

  try {
    browser = await chromium.launch({ headless: true })

    // Process base URL first (guaranteed first in manifest)
    const basePage = pagesToCapture[0]
    if (basePage) {
      try {
        await capturePageForManifest(browser, basePage, activeViewports, {
          quality,
          timeout,
          waitMs,
          maxHeight,
          isPreScrollEnabled,
          outDir
        })
        captured++
      } catch (err) {
        const reason = err.message || String(err)
        warn(`skipped ${basePage.url}: ${reason}`.slice(0, 200))
        manifestSkipped.push({
          url: basePage.url,
          source: basePage.source,
          reason: reason.slice(0, 100)
        })
      }
    }

    // Process remaining pages with concurrency
    const queue = pagesToCapture.slice(1)
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const pageEntry = queue.shift()
        if (!pageEntry) break

        try {
          await capturePageForManifest(browser, pageEntry, activeViewports, {
            quality,
            timeout,
            waitMs,
            maxHeight,
            isPreScrollEnabled,
            outDir
          })
          captured++
        } catch (err) {
          const reason = err.message || String(err)
          warn(`skipped ${pageEntry.url}: ${reason}`.slice(0, 200))
          manifestSkipped.push({
            url: pageEntry.url,
            source: pageEntry.source,
            reason: reason.slice(0, 100)
          })
        }
      }
    })

    await Promise.all(workers)
  } finally {
    if (browser) await browser.close()
  }

  if (captured === 0) {
    fatal('no pages captured')
  }

  // Write manifest
  const manifest = {
    baseUrl,
    createdAt: new Date().toISOString(),
    viewports: Object.fromEntries(
      activeViewports.map(vp => [vp.name, { width: vp.width }])
    ),
    pages: manifestPages,
    skipped: manifestSkipped
  }

  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  process.stdout.write(manifestPath + '\n')
}

// ── URL discovery ─────────────────────────────────────────
async function discoverLinks(baseUrl, timeout) {
  const browser = await chromium.launch({ headless: true })
  const links = new Set()

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout })
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 })
    } catch {
      // proceed
    }

    // Pre-scroll to reveal lazy-loaded links
    const scrollHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
    )
    if (scrollHeight > 0) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight)
      )
      await new Promise(r => setTimeout(r, 300))
      await page.evaluate(() => window.scrollTo(0, 0))
      await new Promise(r => setTimeout(r, 300))
    }

    const origin = new URL(baseUrl).origin
    const rawLinks = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href]')]
      return anchors.map(a => ({
        href: a.href,
        text: (a.textContent || '').trim()
      }))
    })

    for (const { href } of rawLinks) {
      try {
        const parsed = new URL(href)

        // Same origin only
        if (parsed.origin !== origin) continue

        // Skip non-http protocols
        if (!['http:', 'https:'].includes(parsed.protocol)) continue

        // Skip mailto, tel, javascript, data
        if (
          ['mailto:', 'tel:', 'javascript:', 'data:'].includes(
            href.split(':')[0] + ':'
          )
        )
          continue

        // Skip anchors-only
        if (href.startsWith('#')) continue

        // Skip asset/file extensions
        const pathPart = parsed.pathname.split('?')[0].split('#')[0]
        const assetExts = [
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.webp',
          '.svg',
          '.pdf',
          '.zip',
          '.tar',
          '.gz',
          '.doc',
          '.docx',
          '.xls',
          '.xlsx',
          '.ppt',
          '.pptx',
          '.mp3',
          '.mp4',
          '.avi',
          '.mov',
          '.wmv',
          '.flv',
          '.wav',
          '.ico',
          '.css',
          '.js',
          '.map',
          '.woff',
          '.woff2',
          '.ttf',
          '.eot',
          '.json',
          '.xml',
          '.csv',
          '.exe',
          '.dmg',
          '.apk',
          '.deb',
          '.rpm'
        ]
        if (assetExts.some(ext => pathPart.endsWith(ext))) continue

        // Normalize: remove hash, preserve path+search
        const normalized = parsed.origin + parsed.pathname + parsed.search
        links.add(normalized)
      } catch {
        // skip invalid URLs
      }
    }
  } finally {
    await browser.close()
  }

  return [...links]
}

// ── Capture page for manifest ─────────────────────────────
async function capturePageForManifest(browser, pageEntry, viewports, opts) {
  const { quality, timeout, waitMs, maxHeight, isPreScrollEnabled, outDir } =
    opts
  const screenshots = {}

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: 900 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    })

    const page = await context.newPage()
    const filename = await captureOnePage(page, pageEntry.url, vp.name, {
      quality,
      timeout,
      waitMs,
      maxHeight,
      isPreScrollEnabled,
      outDir
    })

    if (filename) {
      screenshots[vp.name] = filename
    }

    await context.close()

    if (!filename) {
      warn(`failed to capture ${vp.name} for ${pageEntry.url}`)
    }
  }

  // Only add to manifest if at least one viewport succeeded
  if (Object.keys(screenshots).length > 0) {
    manifestPages.push({
      url: pageEntry.url,
      source: pageEntry.source,
      screenshots
    })
  }
}

// ── Page capture core ─────────────────────────────────────
async function capturePage(page, opts) {
  const {
    url,
    format,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled
  } = opts

  // Navigate
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout })

  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 })
  } catch {
    // proceed
  }

  // Pre-scroll
  if (isPreScrollEnabled) {
    await preScroll(page)
  }

  // Image wait
  if (isPreScrollEnabled) {
    await waitForImages(page)
  }

  // Extra wait
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs))
  }

  // Screenshot
  let buffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality })

  // Max-height crop
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

  // Convert format
  if (format === 'webp') {
    buffer = await sharp(buffer).webp({ quality }).toBuffer()
  } else if (format === 'png') {
    buffer = await sharp(buffer).png().toBuffer()
  } else {
    buffer = await sharp(buffer).jpeg({ quality }).toBuffer()
  }

  if (isLimited) {
    console.error(`MSHOT_LIMITED: page was taller than --max-height`)
  }

  return buffer
}

async function captureOnePage(page, url, viewportName, opts) {
  const { quality, timeout, waitMs, maxHeight, isPreScrollEnabled, outDir } =
    opts

  try {
    const buffer = await capturePage(page, {
      url,
      format: 'jpeg',
      quality,
      timeout,
      waitMs,
      maxHeight,
      isPreScrollEnabled
    })
    const safeName = urlToSafeName(url)
    const filename = `${safeName}-${viewportName}.jpg`
    const outPath = join(outDir, filename)

    // Atomic write
    const tmpFile = outPath + '.tmp-' + randomUUID()
    const stream = createWriteStream(tmpFile)
    stream.write(buffer)
    stream.end()

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    renameSync(tmpFile, outPath)

    return filename
  } catch {
    return null
  }
}

// ── Scroll helpers ────────────────────────────────────────
async function preScroll(page) {
  const scrollHeight = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  )

  if (scrollHeight <= 0) return

  const viewportHeight = await page.evaluate(() => window.innerHeight)
  const step = Math.max(300, Math.floor(viewportHeight * SCROLL.stepRatio))
  const cappedHeight = Math.min(scrollHeight, SCROLL.maxHeight)

  if (scrollHeight > SCROLL.maxHeight) {
    console.error(
      `MSHOT_SCROLL_LIMITED: page height ${scrollHeight}px, ` +
        `pre-scroll capped at ${SCROLL.maxHeight}px`
    )
  }

  for (let pass = 0; pass < SCROLL.maxPasses; pass++) {
    for (let y = 0; y < cappedHeight; y += step) {
      await page.evaluate(top => window.scrollTo(0, top), y)
      await new Promise(r => setTimeout(r, SCROLL.delayMs))

      const nextHeight = await page.evaluate(() =>
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        )
      )
      if (nextHeight > cappedHeight) {
        // page grew, continue
      }
    }

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    )
    await new Promise(r => setTimeout(r, SCROLL.delayMs))
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  await new Promise(r => setTimeout(r, 300))

  console.error(`MSHOT_SCROLL: page height ${scrollHeight}px, pre-scroll done`)
}

async function waitForImages(page) {
  await page.evaluate(async timeout => {
    const images = [...document.images]
    const pending = images.filter(img => !img.complete)

    if (pending.length === 0) return

    await Promise.all(
      pending.map(
        img =>
          new Promise(resolve => {
            img.addEventListener('load', resolve)
            img.onerror = resolve
            setTimeout(resolve, timeout)
          })
      )
    )
  }, SCROLL.imageTimeout)
}

// ── Filename helpers ──────────────────────────────────────
function urlToSafeName(url) {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname
      .split('?')[0]
      .split('#')[0]
      .replace(/^[\/]+/, '') // strip leading slashes
      .replaceAll(/[\/]+/g, '-') // slashes → hyphens
      .replaceAll(/[^a-zA-Z0-9\-]/g, '') // remove unsafe chars
      .replaceAll(/-+/g, '-') // collapse hyphens
      .replace(/-$/, '') // trailing hyphen

    if (!path) path = 'home'
    return path
  } catch {
    return 'unknown-' + randomUUID().slice(0, 8)
  }
}
