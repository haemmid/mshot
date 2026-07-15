// lib/settle.js — best-effort resource settling (fonts, images)
// Receives an existing Playwright page. Does NOT launch/close browser.
// Does NOT navigate or screenshot.
//
// Exports: settlePage(page, options) → { fontWaitMs, imageWaitMs, warnings }
//
// No imports from capture.js.

const DEFAULT_SETTLE_TIMEOUT = 3000

// ── settlePage(page, options) → { fontWaitMs, imageWaitMs, warnings } ──
export async function settlePage(page, opts) {
  const timeout =
    opts.settleTimeout !== undefined && opts.settleTimeout > 0
      ? opts.settleTimeout
      : DEFAULT_SETTLE_TIMEOUT

  const warnings = []
  const timings = { fontWaitMs: 0, imageWaitMs: 0 }

  // Shared deadline for fonts + images
  const settleStart = now()
  const deadline = settleStart + timeout

  // ── Font wait (best-effort, time-boxed) ──────────────────
  const fontRemaining = Math.max(0, deadline - now())
  if (fontRemaining > 0) {
    try {
      await waitForFonts(page, fontRemaining)
    } catch (e) {
      if (isTimeoutError(e)) {
        warnings.push('font settle timed out')
      } else {
        throw e
      }
    }
  }
  timings.fontWaitMs = elapsed(now(), settleStart)

  // ── Image wait (best-effort, remaining budget) ──────────
  const imgRemaining = Math.max(0, deadline - now())
  if (imgRemaining > 0) {
    try {
      await waitForImages(page, imgRemaining)
    } catch (e) {
      if (isTimeoutError(e)) {
        warnings.push('image settle timed out')
      } else {
        throw e
      }
    }
  }
  timings.imageWaitMs = elapsed(now(), settleStart)

  return { ...timings, warnings }
}

// ── waitForFonts(page, timeout) ──────────────────────────
// Sync predicate: !document.fonts || document.fonts.status === 'loaded'
async function waitForFonts(page, timeout) {
  const predicate = '(!document.fonts || document.fonts.status === "loaded")'
  await pollSync(page, predicate, timeout)
}

// ── waitForImages(page, timeout) ─────────────────────────
// Sync predicate: [...document.images].every(img => img.complete)
async function waitForImages(page, timeout) {
  const predicate = '[...document.images].every(img => img.complete)'
  await pollSync(page, predicate, timeout)
}

// ── pollSync(page, predicate, timeout) ───────────────────
// Manual polling with native Promise.race timeout.
// Avoids page.waitForFunction's broken timeout for never-true predicates.
async function pollSync(page, predicate, timeout) {
  await Promise.race([intervalPoll(page, predicate), timeoutPromise(timeout)])
}

// Poll the sync predicate every 50ms until truthy
async function intervalPoll(page, predicate) {
  const maxAttempts = 1000 // safety ceiling (50s)
  for (let i = 0; i < maxAttempts; i++) {
    const result = await page.evaluate(predicate)
    if (result) return
    await new Promise(r => setTimeout(r, 50))
  }
}

// ── Helpers ───────────────────────────────────────────────
function now() {
  return performance.now ? performance.now() : Date.now()
}

function elapsed(now, start) {
  return Math.round(now - start)
}

function isTimeoutError(e) {
  return e && (e.name === 'TimeoutError' || e.message === 'settle timeout')
}

function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('settle timeout')), ms)
  })
}
