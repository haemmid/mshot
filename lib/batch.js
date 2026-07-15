// lib/batch.js — batch orchestrator
// Exports: runBatch(options) → { manifestPath, capturedCount, skipped }
//
// Launches one Chromium browser for the whole batch.
// Discovery reuses the batch browser — no separate browser.
//
// This module captures pages and writes manifest.
// It does not analyze screenshots or call models.

import { chromium } from 'playwright'
import { USER_AGENT } from './options.js'
import { capturePage } from './capture.js'
import { writeBuffer, screenshotPath } from './output.js'
import { discoverLinks } from './discovery.js'
import { dedupeByPattern } from './route-patterns.js'
import { readUrlsFile, filterDuplicateCandidates } from './url-list.js'
import {
  createPageRecord,
  createSkipRecord,
  createDedupSkipRecord,
  buildManifest,
  writeManifest
} from './manifest.js'

export async function runBatch(opts) {
  const {
    url,
    outDir,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled,
    isSettleEnabled,
    settleTimeout,
    networkidleTimeout,
    discover,
    maxPages,
    concurrency,
    viewports,
    routeDedupe,
    maxPerPattern,
    depth,
    urlsFile
  } = opts

  const manifestSkipped = []
  const manifestPages = []

  // Create output directory
  try {
    mkdirSync(outDir, { recursive: true })
  } catch {
    return { error: `cannot create output directory: ${outDir}` }
  }

  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
  const browser = await chromium.launch({ headless: true })

  try {
    // ── Build candidate list ──────────────────────────────
    let inputUrls = []
    let inputSkipped = []

    if (urlsFile) {
      const result = readUrlsFile(urlsFile, url)
      if (result.error) return { error: result.error }
      inputUrls = result.urls
      inputSkipped = result.skipped
      manifestSkipped.push(...inputSkipped)
    }

    // If --urls-file is specified, input URLs are the base;
    // otherwise base URL is the single entry.
    let pagesToCapture
    pagesToCapture = urlsFile
      ? inputUrls.map(u => ({ ...u }))
      : [{ url: baseUrl, source: 'base' }]

    // ── Discover (optional) ───────────────────────────────
    if (discover) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: USER_AGENT
      })
      const page = await context.newPage()

      try {
        const discovered = await discoverLinks(
          page,
          baseUrl,
          timeout,
          networkidleTimeout
        )
        const deduped = dedupeByPattern(discovered, routeDedupe, maxPerPattern)

        // Depth 2: discover links from representative pages
        let extraUrls = []
        if (depth >= 2) {
          for (const rep of deduped.representatives) {
            if (pagesToCapture.length + extraUrls.length >= maxPages) break
            try {
              const page2 = await context.newPage()
              try {
                const subLinks = await discoverLinks(
                  page2,
                  rep.url,
                  timeout,
                  networkidleTimeout
                )
                extraUrls.push(...subLinks)
              } finally {
                await page2.close()
              }
            } catch {
              // skip failed depth-2 discovery
            }
          }
        }

        // Merge discovered URLs, filtering out exact duplicates of input URLs
        const discoveredCandidates = [
          ...deduped.representatives.map(r => r.url),
          ...extraUrls
        ]

        // Dedup within discovered set first
        const seenInDiscovered = new Set()
        const uniqueDiscovered = []
        for (const dUrl of discoveredCandidates) {
          if (seenInDiscovered.has(dUrl)) continue
          seenInDiscovered.add(dUrl)
          uniqueDiscovered.push(dUrl)
        }

        // Filter out URLs that are already in input URLs
        const filtered = filterDuplicateCandidates(inputUrls, uniqueDiscovered)

        for (const dUrl of filtered) {
          if (pagesToCapture.length >= maxPages) break
          pagesToCapture.push({ url: dUrl, source: 'rendered-link' })
        }

        // Dedup duplicates → skipped
        for (const dup of deduped.duplicates) {
          manifestSkipped.push(createDedupSkipRecord(dup, dup.pattern))
        }
      } finally {
        await context.close()
      }
    }

    // ── Enforce max-pages ─────────────────────────────────
    if (pagesToCapture.length > maxPages) {
      const captured = pagesToCapture.slice(0, maxPages)
      const overflow = pagesToCapture.slice(maxPages)

      pagesToCapture = captured

      for (const entry of overflow) {
        manifestSkipped.push(createSkipRecord(entry, 'max-pages'))
      }
    }

    // ── Process base URL first (guaranteed first in manifest) ──
    const basePage = pagesToCapture[0]
    if (basePage) {
      try {
        const result = await capturePageForManifest(
          browser,
          basePage,
          viewports,
          {
            quality,
            timeout,
            waitMs,
            maxHeight,
            isPreScrollEnabled,
            isSettleEnabled,
            settleTimeout,
            networkidleTimeout,
            outDir
          }
        )
        if (result) manifestPages.push(result)
      } catch (err) {
        const reason = err.message || String(err)
        warn(`skipped ${basePage.url}: ${reason}`.slice(0, 200))
        manifestSkipped.push(createSkipRecord(basePage, reason))
      }
    }

    // ── Process remaining pages with concurrency ──────────
    const queue = pagesToCapture.slice(1)
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const pageEntry = queue.shift()
        if (!pageEntry) break

        try {
          const result = await capturePageForManifest(
            browser,
            pageEntry,
            viewports,
            {
              quality,
              timeout,
              waitMs,
              maxHeight,
              isPreScrollEnabled,
              isSettleEnabled,
              settleTimeout,
              networkidleTimeout,
              outDir
            }
          )
          if (result) manifestPages.push(result)
        } catch (err) {
          const reason = err.message || String(err)
          warn(`skipped ${pageEntry.url}: ${reason}`.slice(0, 200))
          manifestSkipped.push(createSkipRecord(pageEntry, reason))
        }
      }
    })

    await Promise.all(workers)
  } finally {
    await browser.close()
  }

  if (manifestPages.length === 0) {
    return { error: 'no pages captured' }
  }

  // Write manifest
  const manifest = buildManifest(
    baseUrl,
    viewports,
    manifestPages,
    manifestSkipped
  )
  const manifestPath = writeManifest(outDir, manifest)

  return {
    manifestPath,
    capturedCount: manifestPages.length,
    skipped: manifestSkipped
  }
}

// ── Capture one page across all viewports ─────────────────
async function capturePageForManifest(browser, pageEntry, viewports, opts) {
  const {
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled,
    isSettleEnabled,
    settleTimeout,
    networkidleTimeout,
    outDir
  } = opts
  const screenshots = {}
  let pageTimings = null

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: 900 },
      userAgent: USER_AGENT
    })
    const page = await context.newPage()

    try {
      const { buffer, timings } = await capturePage(page, {
        url: pageEntry.url,
        format: 'jpeg',
        quality,
        timeout,
        waitMs,
        maxHeight,
        isPreScrollEnabled,
        isSettleEnabled,
        settleTimeout,
        networkidleTimeout
      })

      const outPath = screenshotPath(outDir, pageEntry.url, vp.name, '.jpg')
      const result = await writeBuffer(buffer, outPath)
      const filename = result ? result.path.split('/').pop() : null

      if (filename) {
        screenshots[vp.name] = filename
        if (!pageTimings) pageTimings = timings
      }
    } catch {
      // skip viewport
    } finally {
      await context.close()
    }
  }

  if (Object.keys(screenshots).length === 0) {
    return null
  }

  return createPageRecord(pageEntry, screenshots, pageTimings)
}

// ── Helpers ───────────────────────────────────────────────
import { mkdirSync } from 'node:fs'

function warn(message) {
  console.error(`MSHOT_WARN: ${message}`)
}
