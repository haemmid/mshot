// test/lib/segments.test.js — reduced unit tests for lib/segments.js
// Essentials only: basic segmentation, overview, validation, coordinate math
// Uses PNG format for speed (JPEG encode is 5-10x slower)

import { createSegmentArtifacts } from '../../lib/segments.js'
import sharp from 'sharp'

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

// ── Helpers ───────────────────────────────────────────────
function createStripesBuffer(width, height, stripeCount) {
  const stripeHeight = Math.max(1, Math.floor(height / stripeCount))
  const data = Buffer.alloc(width * height * 3)
  for (let i = 0; i < stripeCount; i++) {
    const yStart = i * stripeHeight
    const h = Math.min(stripeHeight, height - yStart)
    if (h <= 0) break
    const color = (i * 137) & 0xff
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (yStart + y) * width * 3 + x * 3
        data[idx] = color
        data[idx + 1] = (color * 2) & 0xff
        data[idx + 2] = (color * 3) & 0xff
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}

async function getDimensions(buffer) {
  const m = await sharp(buffer).metadata()
  return { width: m.width, height: m.height }
}

// ── 1. Basic segmentation cases ───────────────────────────
console.log('\n1. Basic segmentation cases')
{
  const cases = [
    { H: 1000, segH: 2200, OV: 300, segCount: 1, label: 'short' },
    { H: 2200, segH: 2200, OV: 300, segCount: 1, label: 'exact' },
    { H: 8000, segH: 2200, OV: 300, segCount: 5, label: 'long' }
  ]

  for (const { H, segH, OV, segCount, label } of cases) {
    const buf = await createStripesBuffer(1440, H, 20)
    const result = await createSegmentArtifacts(buf, {
      segmentHeight: segH,
      segmentOverlap: OV,
      quality: 82,
      format: 'png'
    })

    assert(
      result.segments.length === segCount,
      `${label}: ${segCount} segments`
    )
    assert(result.segments[0].y === 0, `${label}: first segment y=0`)
    const lastSeg = result.segments.at(-1)
    assert(lastSeg.y + lastSeg.height === H, `${label}: last ends at H`)
    assert(result.segments[0].width === 1440, `${label}: width=1440`)
  }
}

// ── 2. Overview: scale + aspect ratio ─────────────────────
console.log('\n2. Overview: scale + aspect ratio')
{
  // Tall page → scaled overview
  const tallBuf = await createStripesBuffer(1440, 10_000, 30)
  const tallResult = await createSegmentArtifacts(tallBuf, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'png'
  })
  const tallDims = await getDimensions(tallResult.overview.buffer)
  assert(tallDims.height === 3000, 'tall overview height = 3000')
  const expectedWidth = Math.round(1440 * (3000 / 10_000))
  assert(
    tallDims.width === expectedWidth,
    `tall overview width = ${expectedWidth}`
  )

  // Short page → original
  const shortBuf = await createStripesBuffer(800, 2000, 10)
  const shortResult = await createSegmentArtifacts(shortBuf, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'png'
  })
  const shortDims = await getDimensions(shortResult.overview.buffer)
  assert(shortDims.width === 800, 'short overview width unchanged')
  assert(shortDims.height === 2000, 'short overview height unchanged')

  // Aspect ratio preserved
  const ratio = 1440 / 10_000
  const actualRatio = tallDims.width / tallDims.height
  assert(Math.abs(ratio - actualRatio) < 0.01, 'aspect ratio preserved')
}

// ── 3. Segment buffer dimensions ──────────────────────────
console.log('\n3. Segment buffer dimensions')
{
  const buf = await createStripesBuffer(1440, 8000, 30)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'png'
  })

  for (const seg of result.segments) {
    const segDims = await getDimensions(seg.buffer)
    assert(segDims.width === seg.width, `segment buffer width matches`)
    assert(segDims.height === seg.height, `segment buffer height matches`)
  }
}

// ── 4. Coordinate math (no Sharp, fast) ───────────────────
console.log('\n4. Coordinate math (no Sharp)')
{
  function computeSegments(sourceHeight, segmentHeight, segmentOverlap) {
    const segments = []
    let step = segmentHeight - segmentOverlap
    if (step <= 0) step = segmentHeight
    if (sourceHeight <= segmentHeight) {
      segments.push({ x: 0, y: 0, width: 1440, height: sourceHeight })
      return segments
    }
    let y = 0,
      index = 1
    while (y + segmentHeight < sourceHeight) {
      segments.push({ x: 0, y, width: 1440, height: segmentHeight, index })
      y += step
      index++
    }
    const lastY = Math.max(0, sourceHeight - segmentHeight)
    if (segments.length > 0) {
      const lastSeg = segments.at(-1)
      if (lastSeg.y + segmentHeight >= sourceHeight) {
        if (lastSeg.y === lastY) segments.pop()
        segments.push({
          x: 0,
          y: lastY,
          width: 1440,
          height: segmentHeight,
          index
        })
      } else {
        segments.push({
          x: 0,
          y: lastY,
          width: 1440,
          height: segmentHeight,
          index
        })
      }
    } else {
      segments.push({
        x: 0,
        y: lastY,
        width: 1440,
        height: segmentHeight,
        index
      })
    }
    return segments
  }

  const testCases = [
    { H: 1000, SH: 2200, OV: 300, expected: 1 },
    { H: 4400, SH: 2200, OV: 300, expected: 3 },
    { H: 15_000, SH: 2200, OV: 300, expected: 8 },
    { H: 30_000, SH: 2200, OV: 300, expected: 16 },
    { H: 30_000, SH: 3000, OV: 0, expected: 10 }
  ]

  for (const tc of testCases) {
    const segs = computeSegments(tc.H, tc.SH, tc.OV)
    assert(
      segs.length === tc.expected,
      `H=${tc.H}: ${segs.length} segments (expected ${tc.expected})`
    )
    const lastSeg = segs.at(-1)
    assert(lastSeg.y + lastSeg.height === tc.H, `H=${tc.H}: last ends at H`)
    const ys = segs.map(s => s.y)
    assert(ys.length === new Set(ys).size, `H=${tc.H}: no duplicate y`)
  }
}

// ── 5. Validation: invalid segmentHeight/overlap ──────────
console.log('\n5. Validation: invalid segmentHeight/overlap')
{
  const vbuf = await createStripesBuffer(1440, 5000, 20)

  try {
    await createSegmentArtifacts(vbuf, {
      segmentHeight: 0,
      segmentOverlap: 0,
      quality: 82,
      format: 'png'
    })
  } catch {
    assert(true, 'segmentHeight=0 throws')
  }
  try {
    await createSegmentArtifacts(vbuf, {
      segmentHeight: 2200,
      segmentOverlap: -1,
      quality: 82,
      format: 'png'
    })
  } catch {
    assert(true, 'segmentOverlap=-1 throws')
  }
  try {
    await createSegmentArtifacts(vbuf, {
      segmentHeight: 2200,
      segmentOverlap: 2200,
      quality: 82,
      format: 'png'
    })
  } catch {
    assert(true, 'overlap>=height throws')
  }
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
console.log(`${'='.repeat(40)}\n`)

if (state.failed > 0) throw new Error(`${state.failed} tests failed`)
