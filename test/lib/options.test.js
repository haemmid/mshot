// test/lib/options.test.js — unit tests for lib/options.js pure helpers
// Usage: node test/lib/options.test.js
//
// Production validateSingle/validateBatch use parseInt() — no range clamping.

import {
  parseViewports,
  validateSingle,
  validateBatch,
  DEFAULTS,
  ALLOWED_EXTS
} from '../../lib/options.js'

const state = { passed: 0, failed: 0 }

function assert(condition, label) {
  if (condition) {
    state.passed++
    console.log(`  ✅ ${label}`)
  } else {
    state.failed++
    console.error(`  ❌ ${label}`)
  }
}

// ── parseViewports ────────────────────────────────────────
console.log('\nparseViewports')
{
  // Default
  {
    const result = parseViewports()
    assert(result.viewports.length === 1, 'default: 1 viewport')
    assert(result.viewports[0].name === 'desktop', 'default: desktop')
    assert(result.viewports[0].width === 1440, 'default: width 1440')
  }

  // Single viewport
  {
    const result = parseViewports('mobile')
    assert(result.viewports.length === 1, 'single: 1 viewport')
    assert(result.viewports[0].name === 'mobile', 'single: mobile')
    assert(result.viewports[0].width === 390, 'single: width 390')
  }

  // Multiple viewports
  {
    const result = parseViewports('desktop, mobile')
    assert(result.viewports.length === 2, 'multi: 2 viewports')
    assert(result.viewports[0].name === 'desktop', 'multi: first desktop')
    assert(result.viewports[1].name === 'mobile', 'multi: second mobile')
  }

  // Case insensitive
  {
    const result = parseViewports('DESKTOP,Mobile')
    assert(result.viewports.length === 2, 'case insensitive')
    assert(result.viewports[0].name === 'desktop', 'lowercase desktop')
    assert(result.viewports[1].name === 'mobile', 'lowercase mobile')
  }

  // Unknown viewport
  {
    const result = parseViewports('tablet')
    assert(result.error !== undefined, 'unknown viewport → error')
    assert(result.error.includes('tablet'), 'error mentions unknown name')
    assert(result.error.includes('desktop'), 'error lists supported')
  }

  // Mixed valid/invalid
  {
    const result = parseViewports('desktop,invalid')
    assert(result.error !== undefined, 'mixed → error on invalid')
    assert(result.viewports === undefined, 'mixed → no viewports on error')
  }
}

// ── validateSingle — defaults ─────────────────────────────
console.log('\nvalidateSingle — defaults')
{
  const result = validateSingle({
    out: '/tmp/test.jpg',
    width: String(DEFAULTS.width),
    quality: String(DEFAULTS.quality),
    timeout: String(DEFAULTS.timeout),
    wait: String(DEFAULTS.wait),
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(!result.error, 'no error for valid defaults')
  assert(result.width === DEFAULTS.width, 'width default')
  assert(result.quality === DEFAULTS.quality, 'quality default')
  assert(result.timeout === DEFAULTS.timeout, 'timeout default')
  assert(result.waitMs === DEFAULTS.wait, 'wait default')
  assert(result.maxHeight === undefined, 'maxHeight undefined by default')
  assert(result.isPreScrollEnabled === true, 'pre-scroll enabled by default')
  assert(result.format === 'jpeg', 'format is jpeg for .jpg')
}

// ── validateSingle — extension validation ─────────────────
console.log('\nvalidateSingle — extension validation')
{
  const exts = ALLOWED_EXTS
  for (const ext of exts) {
    const result = validateSingle({
      out: `/tmp/test${ext}`,
      width: '1440',
      quality: '82',
      timeout: '30000',
      wait: '500',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(!result.error, `extension ${ext} accepted`)
  }

  const badExts = ['.gif', '.bmp', '.svg', '.pdf', '']
  for (const ext of badExts) {
    const result = validateSingle({
      out: `/tmp/test${ext || 'noext'}`,
      width: '1440',
      quality: '82',
      timeout: '30000',
      wait: '500',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(result.error !== undefined, `extension ${ext || 'noext'} → error`)
    assert(result.error.includes('unsupported'), 'error mentions unsupported')
  }
}

// ── validateSingle — numeric parsing (parseInt, no clamp) ─
console.log('\nvalidateSingle — numeric parsing (no clamping)')
{
  // Non-numeric → NaN from parseInt
  {
    const result = validateSingle({
      out: '/tmp/test.jpg',
      width: 'abc',
      quality: 'xyz',
      timeout: '---',
      wait: '!!',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(!result.error, 'non-numeric → NaN from parseInt')
    assert(Number.isNaN(result.width), 'width is NaN for non-numeric')
    assert(Number.isNaN(result.quality), 'quality is NaN for non-numeric')
    assert(Number.isNaN(result.timeout), 'timeout is NaN for non-numeric')
    assert(Number.isNaN(result.waitMs), 'wait is NaN for non-numeric')
  }

  // Out-of-range values pass through (parseInt, no clamp)
  {
    const result = validateSingle({
      out: '/tmp/test.jpg',
      width: '50',
      quality: '0',
      timeout: '100',
      wait: '-10',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(result.width === 50, 'width 50 passes through')
    assert(result.quality === 0, 'quality 0 passes through')
    assert(result.timeout === 100, 'timeout 100 passes through')
    assert(result.waitMs === -10, 'wait -10 passes through')
  }

  // Large values pass through
  {
    const result = validateSingle({
      out: '/tmp/test.jpg',
      width: '10000',
      quality: '150',
      timeout: '999999',
      wait: '999999',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(result.width === 10_000, 'width 10000 passes through')
    assert(result.quality === 150, 'quality 150 passes through')
    assert(result.timeout === 999_999, 'timeout 999999 passes through')
    assert(result.waitMs === 999_999, 'wait 999999 passes through')
  }

  // Max-height
  {
    let result = validateSingle({
      out: '/tmp/test.jpg',
      width: '1440',
      quality: '82',
      timeout: '30000',
      wait: '500',
      'max-height': '5000',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(result.maxHeight === 5000, 'max-height 5000')

    result = validateSingle({
      out: '/tmp/test.jpg',
      width: '1440',
      quality: '82',
      timeout: '30000',
      wait: '500',
      'max-height': '50',
      'pre-scroll': true,
      'no-pre-scroll': false
    })
    assert(result.maxHeight === 50, 'max-height 50 passes through')
  }
}

// ── validateSingle — pre-scroll flag ──────────────────────
console.log('\nvalidateSingle — pre-scroll flag')
{
  let result = validateSingle({
    out: '/tmp/test.jpg',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': false,
    'no-pre-scroll': true
  })
  assert(result.isPreScrollEnabled === false, 'no-pre-scroll disables')

  result = validateSingle({
    out: '/tmp/test.jpg',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(result.isPreScrollEnabled === true, 'pre-scroll enabled')
}

// ── validateSingle — format detection ─────────────────────
console.log('\nvalidateSingle — format detection')
{
  let result = validateSingle({
    out: '/tmp/test.jpg',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(result.format === 'jpeg', '.jpg → jpeg')

  result = validateSingle({
    out: '/tmp/test.jpeg',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(result.format === 'jpeg', '.jpeg → jpeg')

  result = validateSingle({
    out: '/tmp/test.png',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(result.format === 'png', '.png → png')

  result = validateSingle({
    out: '/tmp/test.webp',
    width: '1440',
    quality: '82',
    timeout: '30000',
    wait: '500',
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(result.format === 'webp', '.webp → webp')
}

// ── validateBatch — defaults ──────────────────────────────
console.log('\nvalidateBatch — defaults')
{
  const result = validateBatch({
    'out-dir': '/tmp/batch-test',
    viewports: undefined,
    'no-route-dedupe': false,
    'max-per-pattern': undefined,
    depth: undefined,
    'networkidle-timeout': undefined,
    'urls-file': undefined,
    discover: false,
    'max-pages': undefined,
    concurrency: undefined,
    quality: String(DEFAULTS.quality),
    timeout: String(DEFAULTS.timeout),
    wait: String(DEFAULTS.wait),
    'pre-scroll': true,
    'no-pre-scroll': false
  })
  assert(!result.error, 'no error for valid defaults')
  assert(result.maxPages === 12, 'maxPages default 12')
  assert(result.concurrency === 2, 'concurrency default 2')
  assert(result.maxPerPattern === 1, 'maxPerPattern default 1')
  assert(result.depth === 1, 'depth default 1')
  assert(
    result.networkidleTimeout === DEFAULTS.batchNetworkidleTimeout,
    'networkidleTimeout default'
  )
  assert(result.routeDedupe === true, 'routeDedupe enabled by default')
  assert(result.discover === false, 'discover disabled by default')
  assert(result.viewports.length === 1, 'default viewport: desktop')
  assert(result.viewports[0].name === 'desktop', 'default viewport name')
}

// ── validateBatch — batch-specific validation ─────────────
console.log('\nvalidateBatch — batch-specific validation')
{
  // Missing out-dir
  {
    const result = validateBatch({
      viewports: undefined,
      'no-route-dedupe': false
    })
    assert(result.error !== undefined, 'missing out-dir → error')
    assert(result.error.includes('--out-dir'), 'error mentions out-dir')
  }

  // maxPages — parseInt with || 12 fallback (0 is falsy → 12)
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      'max-pages': '0'
    })
    assert(result.maxPages === 12, 'maxPages 0 → fallback 12 (|| 12)')

    const result2 = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      'max-pages': '100'
    })
    assert(result2.maxPages === 100, 'maxPages 100 unchanged')
  }

  // concurrency — parseInt with || 2 fallback (0 is falsy → 2)
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      concurrency: '0'
    })
    assert(result.concurrency === 2, 'concurrency 0 → fallback 2 (|| 2)')

    const result2 = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      concurrency: '8'
    })
    assert(result2.concurrency === 8, 'concurrency 8 unchanged')
  }

  // maxPerPattern — parseInt with || 1 fallback (0 is falsy → 1)
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      'max-per-pattern': '0'
    })
    assert(result.maxPerPattern === 1, 'maxPerPattern 0 → fallback 1 (|| 1)')
  }

  // depth — parseInt with || 1 fallback (0 is falsy → 1)
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      depth: '0'
    })
    assert(result.depth === 1, 'depth 0 → fallback 1 (|| 1)')

    const result2 = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      depth: '5'
    })
    assert(result2.depth === 5, 'depth 5 unchanged')
  }

  // networkidleTimeout — ternary parseInt
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      'networkidle-timeout': '100'
    })
    assert(
      result.networkidleTimeout === 100,
      'networkidleTimeout 100 passes through (parseInt)'
    )
  }

  // --no-route-dedupe
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': true
    })
    assert(result.routeDedupe === false, 'no-route-dedupe disables dedupe')
  }

  // viewports in batch
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: 'desktop,mobile',
      'no-route-dedupe': false
    })
    assert(result.viewports.length === 2, 'two viewports')
    assert(result.viewports[0].name === 'desktop', 'first is desktop')
    assert(result.viewports[1].name === 'mobile', 'second is mobile')
  }

  // viewports error propagates
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: 'tablet',
      'no-route-dedupe': false
    })
    assert(result.error !== undefined, 'invalid viewport → error')
  }

  // urls-file propagation
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      'urls-file': '/tmp/urls.txt'
    })
    assert(result.urlsFile === '/tmp/urls.txt', 'urlsFile propagated')
  }

  // batch quality/timeout/wait — parseInt, no clamping
  {
    const result = validateBatch({
      'out-dir': '/tmp/x',
      viewports: undefined,
      'no-route-dedupe': false,
      quality: '0',
      timeout: '500',
      wait: '-10'
    })
    assert(result.quality === 0, 'batch quality 0 passes through')
    assert(result.timeout === 500, 'batch timeout 500 passes through')
    assert(result.waitMs === -10, 'batch wait -10 passes through')
  }
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
console.log(`${'='.repeat(40)}\n`)

// eslint-disable-next-line unicorn/no-process-exit
process.exit(state.failed > 0 ? 1 : 0)
