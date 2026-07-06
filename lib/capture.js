// lib/capture.js — core page capture logic
// Receives an existing Playwright page. Does NOT launch/close browser.
// Does NOT write files. Returns buffer + timings.

import { SCROLL } from './options.js'
import sharp from 'sharp'

// ── capturePage(page, options) → { buffer, limited, warnings, timings } ──
export async function capturePage(page, opts) {
  const {
    url,
    format,
    quality,
    timeout,
    waitMs,
    maxHeight,
    isPreScrollEnabled,
    networkidleTimeout
  } = opts
  const warnings = []
  const timings = {}

  // Navigate
  const t0 = now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  timings.gotoMs = elapsed(t0)

  // networkidle
  const ni0 = now()
  try {
    await page.waitForLoadState('networkidle', {
      timeout: networkidleTimeout ?? 10_000
    })
  } catch {
    // proceed
  }
  timings.networkidleMs = elapsed(ni0)

  // Pre-scroll
  if (isPreScrollEnabled) {
    const ps0 = now()
    await preScroll(page)
    timings.preScrollMs = elapsed(ps0)
  }

  // Image wait
  if (isPreScrollEnabled) {
    const iw0 = now()
    await waitForImages(page)
    timings.imageWaitMs = elapsed(iw0)
  }

  // Extra wait
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs))
  }

  // Screenshot
  const ss0 = now()
  let buffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality })
  timings.screenshotMs = elapsed(ss0)

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
  buffer = await convertFormat(buffer, format, quality)

  if (isLimited) {
    warnings.push(`page was taller than --max-height`)
  }

  timings.totalMs = elapsed(t0)

  return { buffer, limited: isLimited, warnings, timings }
}

// ── preScroll(page) ───────────────────────────────────────
export async function preScroll(page) {
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

// ── waitForImages(page) ───────────────────────────────────
export async function waitForImages(page) {
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

// ── Helpers ───────────────────────────────────────────────
function now() {
  return performance.now ? performance.now() : Date.now()
}

function elapsed(start) {
  return Math.round(now() - start)
}

function convertFormat(buffer, format, quality) {
  if (format === 'webp') {
    return sharp(buffer).webp({ quality }).toBuffer()
  }
  if (format === 'png') {
    return sharp(buffer).png().toBuffer()
  }
  return sharp(buffer).jpeg({ quality }).toBuffer()
}
