// lib/options.js — constants, defaults, argument parsing, validation
// No Playwright, no file I/O.

export const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

export const SCROLL = {
  stepRatio: 0.8,
  delayMs: 150,
  maxPasses: 1,
  maxHeight: 30_000,
  imageTimeout: 2000
}

export const DEFAULTS = {
  width: 1440,
  quality: 82,
  timeout: 30_000,
  wait: 500,
  batchNetworkidleTimeout: 2000
}

export const VIEWPORTS = {
  desktop: { width: 1440 },
  mobile: { width: 390 }
}

export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ── parseArgs config (shared) ─────────────────────────────
export function parseArgsConfig() {
  return {
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
      'networkidle-timeout': { type: 'string' },
      'max-per-pattern': { type: 'string' },
      'route-dedupe': { type: 'boolean', default: true },
      'no-route-dedupe': { type: 'boolean', default: false },
      depth: { type: 'string' },
      help: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false }
    },
    allowPositionals: true,
    strict: true
  }
}

// ── Help text ─────────────────────────────────────────────
export function showHelp() {
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
  --networkidle-timeout <ms>  networkidle wait timeout per page, default ${DEFAULTS.batchNetworkidleTimeout}
  --max-per-pattern <n>   Max URLs per route pattern, default 1
  --no-route-dedupe       Disable route pattern deduplication
  --depth <n>             Link discovery depth (1 = base only), default 1

  --version
  --help`)
}

// ── Parse viewports ───────────────────────────────────────
export function parseViewports(raw) {
  const names = raw
    ? raw.split(',').map(v => v.trim().toLowerCase())
    : ['desktop']

  const result = []
  for (const name of names) {
    const vp = VIEWPORTS[name]
    if (!vp) {
      return {
        error: `unknown viewport "${name}"; supported: ${Object.keys(VIEWPORTS).join(', ')}`
      }
    }
    result.push({ name, ...vp })
  }
  return { viewports: result }
}

// ── Validate single-mode options ──────────────────────────
export function validateSingle(values) {
  const outFile = resolve(values.out)
  const extension = extname(outFile).toLowerCase()

  if (!ALLOWED_EXTS.includes(extension)) {
    return {
      error: `unsupported output extension "${extension}"; use .jpg, .jpeg, .png, or .webp`
    }
  }

  return {
    outFile,
    format:
      extension === '.webp' ? 'webp' : extension === '.png' ? 'png' : 'jpeg',
    width: parseInt(values.width, 10),
    quality: parseInt(values.quality, 10),
    timeout: parseInt(values.timeout, 10),
    waitMs: parseInt(values.wait, 10),
    maxHeight: values['max-height']
      ? parseInt(values['max-height'], 10)
      : undefined,
    isPreScrollEnabled: !values['no-pre-scroll'] && values['pre-scroll']
  }
}

// ── Validate batch-mode options ───────────────────────────
export function validateBatch(values) {
  const outDirVal = values['out-dir']
  if (!outDirVal) {
    return { error: '--out-dir is required for batch mode' }
  }

  const vpResult = parseViewports(values.viewports)
  if (vpResult.error) return { error: vpResult.error }

  const routeDedupe = !values['no-route-dedupe'] && values['route-dedupe']
  const maxPerPattern = parseInt(values['max-per-pattern'], 10) || 1
  const depth = parseInt(values.depth, 10) || 1
  const networkidleTimeout = values['networkidle-timeout']
    ? parseInt(values['networkidle-timeout'], 10)
    : DEFAULTS.batchNetworkidleTimeout

  return {
    outDir: resolve(outDirVal),
    quality: parseInt(values.quality, 10),
    timeout: parseInt(values.timeout, 10),
    waitMs: parseInt(values.wait, 10),
    maxHeight: values['max-height']
      ? parseInt(values['max-height'], 10)
      : undefined,
    isPreScrollEnabled: !values['no-pre-scroll'] && values['pre-scroll'],
    discover: values.discover,
    maxPages: parseInt(values['max-pages'], 10) || 12,
    concurrency: parseInt(values.concurrency, 10) || 2,
    viewports: vpResult.viewports,
    networkidleTimeout,
    routeDedupe,
    maxPerPattern,
    depth
  }
}

// ── Helpers ───────────────────────────────────────────────
import { resolve, extname } from 'node:path'
