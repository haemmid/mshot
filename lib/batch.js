// lib/batch.js — batch orchestrator
// Exports: runBatch(options) → { manifestPath, capturedCount, skipped }
// Launches one browser, discovers links, captures pages with concurrency, writes manifest.

import { chromium } from 'playwright'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { USER_AGENT } from './options.js'
import { capturePage } from './capture.js'
import { writeBuffer, screenshotPath } from './output.js'

export async function runBatch(opts) {
  const {
    url,
    outDir,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled,
    discover,
    maxPages,
    concurrency,
    viewports
  } = opts

  const manifestSkipped = []
  let captured = 0

  // Create output directory
  try {
    mkdirSync(outDir, { recursive: true })
  } catch {
    return { error: `cannot create output directory: ${outDir}` }
  }

  // Collect pages — base URL first
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
  const discoveredLinks = discover ? await discoverLinks(baseUrl, timeout) : []
  const pagesToCapture = [{ url: baseUrl, source: 'base' }]
  for (const link of discoveredLinks) {
    if (pagesToCapture.length >= maxPages) break
    pagesToCapture.push({ url: link, source: 'rendered-link' })
  }

  const browser = await chromium.launch({ headless: true })

  try {
    // Process base URL first (guaranteed first in manifest)
    const basePage = pagesToCapture[0]
    if (basePage) {
      try {
        await capturePageForManifest(browser, basePage, viewports, {
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
          await capturePageForManifest(browser, pageEntry, viewports, {
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
    await browser.close()
  }

  if (captured === 0) {
    return { error: 'no pages captured' }
  }

  // Write manifest
  const manifest = {
    baseUrl,
    createdAt: new Date().toISOString(),
    viewports: Object.fromEntries(
      viewports.map(vp => [vp.name, { width: vp.width }])
    ),
    pages: manifestPages,
    skipped: manifestSkipped
  }

  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return { manifestPath, capturedCount: captured, skipped: manifestSkipped }
}

// ── Helpers ───────────────────────────────────────────────
const manifestPages = []

function warn(message) {
  console.error(`MSHOT_WARN: ${message}`)
}

async function capturePageForManifest(browser, pageEntry, viewports, opts) {
  const { quality, timeout, waitMs, maxHeight, isPreScrollEnabled, outDir } =
    opts
  const screenshots = {}

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: 900 },
      userAgent: USER_AGENT
    })

    const page = await context.newPage()
    const filename = await captureOneViewport(page, pageEntry.url, vp.name, {
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

  if (Object.keys(screenshots).length > 0) {
    manifestPages.push({
      url: pageEntry.url,
      source: pageEntry.source,
      screenshots
    })
  }
}

async function captureOneViewport(page, url, viewportName, opts) {
  const { quality, timeout, waitMs, maxHeight, isPreScrollEnabled, outDir } =
    opts

  try {
    const { buffer } = await capturePage(page, {
      url,
      format: 'jpeg',
      quality,
      timeout,
      waitMs,
      maxHeight,
      isPreScrollEnabled
    })

    const outPath = screenshotPath(outDir, url, viewportName, '.jpg')
    const result = await writeBuffer(buffer, outPath)
    return result ? result.path.split('/').pop() : null
  } catch {
    return null
  }
}

async function discoverLinks(baseUrl, timeout) {
  const browser = await chromium.launch({ headless: true })
  const links = new Set()

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: USER_AGENT
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

        if (parsed.origin !== origin) continue
        if (!['http:', 'https:'].includes(parsed.protocol)) continue

        if (
          ['mailto:', 'tel:', 'javascript:', 'data:'].includes(
            href.split(':')[0] + ':'
          )
        )
          continue

        if (href.startsWith('#')) continue

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

        const normalized = parsed.origin + parsed.pathname + parsed.search
        links.add(normalized)
      } catch {
        // skip invalid
      }
    }
  } finally {
    await browser.close()
  }

  return [...links]
}
