// test/lib/segments.test.js — unit tests for lib/segments.js
// Usage: node test/lib/segments.test.js
//
// Tests segmentation math and image processing with synthetic buffers.

import { createSegmentArtifacts } from '../../lib/segments.js'
import sharp from 'sharp'

const state = { passed: 0, failed: 0 }

function assert(condition, label) {
  if (condition) {
    state.passed++
    console.log(`  ✅ ${label}`)
  } else {
    assertError(label)
  }
}

function assertError(label) {
  state.failed++
  console.error(`  ❌ ${label}`)
}

// ── Helpers ───────────────────────────────────────────────
function createStripesBuffer(width, height, stripeCount) {
  // Create a buffer with horizontal stripes of different colors
  // Each stripe is a different height, making it easy to verify crops
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
    .jpeg({ quality: 82 })
    .toBuffer()
}

async function getDimensions(buffer) {
  const m = await sharp(buffer).metadata()
  return { width: m.width, height: m.height }
}

// ── 1. Short image (height < segmentHeight) ──────────────
console.log('\n1. Short image (height < segmentHeight)')
{
  const buf = await createStripesBuffer(1440, 1000, 5)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'jpeg'
  })

  assert(
    result.overview.height === 1000,
    'overview height = source (no upscale)'
  )
  assert(
    result.overview.height === result.overview.sourceHeight,
    'overview height matches source'
  )
  assert(result.overview.width === 1440, 'overview width preserved')
  assert(result.segments.length === 1, 'one segment for short image')
  assert(result.segments[0].y === 0, 'segment y = 0')
  assert(result.segments[0].height === 1000, 'segment height = full page')
  assert(result.segments[0].width === 1440, 'segment width = full width')
}

// ── 2. Image exactly segmentHeight ────────────────────────
console.log('\n2. Image exactly segmentHeight')
{
  const segH = 2200
  const buf = await createStripesBuffer(1440, segH, 10)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: 300,
    quality: 82,
    format: 'jpeg'
  })

  assert(result.segments.length === 1, 'one segment for exact height')
  assert(result.segments[0].y === 0, 'segment y = 0')
  assert(result.segments[0].height === segH, 'segment height = segmentHeight')
  assert(result.overview.height === segH, 'overview = source (no scale)')
}

// ── 3. Image slightly above segmentHeight ─────────────────
console.log('\n3. Image slightly above segmentHeight')
{
  const segH = 2200
  const H = segH + 100
  const buf = await createStripesBuffer(1440, H, 20)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: 300,
    quality: 82,
    format: 'jpeg'
  })

  // Loop: y=0, 0+2200=2200 < 2300 → true, add at y=0
  // y=1900, 1900+2200=4100 < 2300 → false, exit
  // lastY = 2300-2200 = 100, add at y=100
  // Total: 2 segments
  assert(result.segments.length === 2, 'two segments for H > segH')
  assert(result.segments[0].y === 0, 'first segment y = 0')
  assert(
    result.segments[0].height === segH,
    'first segment height = segmentHeight'
  )
  assert(
    result.segments[1].y === H - segH,
    `last segment y = H - S = ${H - segH}`
  )
  assert(
    result.segments[1].height === segH,
    'last segment height = segmentHeight'
  )
  assert(result.segments[1].y + segH === H, 'last segment ends at H')
}

// ── 4. Long image with multiple segments ──────────────────
console.log('\n4. Long image with multiple segments')
{
  const segH = 2200
  const overlap = 300
  const step = segH - overlap // 1900
  const H = 8000
  const buf = await createStripesBuffer(1440, H, 50)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  // Loop iterations: y=0, 1900, 3800, 5700 (y+S < H → 0+2200<8000, 1900+2200<8000, 3800+2200<8000, 5700+2200<8000)
  // 5700+2200=7900 < 8000 → true, so y=5700 is included
  // Next y=5700+1900=7600, 7600+2200=9800 >= 8000 → loop exits
  // Then last segment: y = max(0, 8000-2200) = 5800
  // So segments at: 0, 1900, 3800, 5700, and last at 5800
  // But 5700+2200=7900 < 8000, so 5700 is in loop
  // lastY = 5800, lastSeg.y=5700 != 5800, so we add segment at 5800
  // Total: 5 segments

  const expectedCount = 5
  assert(
    result.segments.length === expectedCount,
    `${expectedCount} segments for H=8000`
  )

  // Check coordinates
  assert(result.segments[0].y === 0, 'first segment y=0')
  assert(result.segments[0].height === segH, 'first segment height=segH')
  assert(result.segments[0].index === 1, 'first segment index=1')

  // Check step pattern
  for (let i = 1; i < result.segments.length - 1; i++) {
    const expectedY = i * step
    assert(result.segments[i].y === expectedY, `segment[${i}] y=${expectedY}`)
  }

  // Last segment
  const lastSeg = result.segments.at(-1)
  assert(lastSeg.y === H - segH, `last segment y = H - S = ${H - segH}`)
  assert(lastSeg.y + segH === H, 'last segment ends at H')
}

// ── 5. Overlap = 0 ────────────────────────────────────────
console.log('\n5. Overlap = 0 (no overlap)')
{
  const segH = 2200
  const H = 6600
  const buf = await createStripesBuffer(1440, H, 40)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: 0,
    quality: 82,
    format: 'jpeg'
  })

  // step = 2200, y=0, 2200, 4400 (0+2200<6600, 2200+2200<6600, 4400+2200=6600 NOT < 6600)
  // loop: y=0, 2200 (4400+2200=6600 NOT < 6600, loop exits)
  // lastY = 6600-2200 = 4400
  // lastSeg.y=2200 != 4400, add segment at 4400
  // Total: 3 segments
  assert(result.segments.length === 3, '3 segments with overlap=0')
  assert(result.segments[0].y === 0, 'first at 0')
  assert(result.segments[1].y === 2200, 'second at 2200')
  assert(result.segments[2].y === 4400, 'third at 4400')
  assert(result.segments[2].y + segH === H, 'last ends at H')
}

// ── 6. Overlap nearly equals segmentHeight ────────────────
console.log('\n6. Overlap nearly equals segmentHeight')
{
  const segH = 2200
  const overlap = 2199
  const step = 1
  const H = 5000
  const buf = await createStripesBuffer(1440, H, 30)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  // step=1, many iterations
  // Each segment overlaps the previous by 2199px
  assert(result.segments.length > 10, 'many segments with high overlap')

  // Check consecutive segments have correct overlap
  for (let i = 1; i < result.segments.length; i++) {
    const expectedY = result.segments[i - 1].y + step
    assert(result.segments[i].y === expectedY, `segment[${i}] y=${expectedY}`)
  }

  // Last segment
  const lastSeg = result.segments.at(-1)
  assert(lastSeg.y === H - segH, `last segment y = H - S = ${H - segH}`)
}

// ── 7. Last segment ends exactly at H ─────────────────────
console.log('\n7. Last segment ends exactly at H')
{
  const segH = 2200
  const overlap = 200
  const step = segH - overlap // 2000
  const H = 6600 // 0, 2000, 4000, lastY=4400
  const buf = await createStripesBuffer(1440, H, 30)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  // y=0: 0+2200=2200<6600 → true
  // y=2000: 2000+2200=4200<6600 → true
  // y=4000: 4000+2200=6200<6600 → true
  // y=6000: 6000+2200=8200>=6600 → loop exits
  // lastY = 6600-2200 = 4400
  // lastSeg.y=4000 != 4400, add at 4400
  // Total: 4 segments
  assert(result.segments.length === 4, '4 segments')
  const lastSeg = result.segments.at(-1)
  assert(lastSeg.y + segH === H, `last segment ends at H=${H}`)
}

// ── 8. No duplicate last segment ──────────────────────────
console.log('\n8. No duplicate last segment')
{
  const segH = 2200
  const overlap = 200
  const step = segH - overlap
  // Craft H so the loop naturally lands on lastY
  // lastY = H - segH
  // We want the loop's last y to equal lastY
  // Loop: y = 0, step, 2*step, ... while y + segH < H
  // Last y from loop: the largest k*step where k*step + segH < H
  // We want k*step = H - segH, but that means k*step + segH = H, which is NOT < H
  // So the loop never lands exactly on lastY (since the condition is strict <)
  // Therefore the last segment is always added separately.
  // The only way to get a duplicate is if lastY equals the previous segment's y.
  // This happens when step = segH (overlap=0) and the last loop iteration lands on lastY.
  // But with overlap=0, step=segH, and lastY=H-segH.
  // If H is a multiple of segH, then lastY = k*segH, and the loop's last y = k*segH.
  // But k*segH + segH = H, which is NOT < H, so the loop stops before lastY.
  // So no duplicates ever. Let's verify with a tricky case.

  const H = 4400 // exactly 2 * segH
  const buf = await createStripesBuffer(1440, H, 20)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  // y=0: 0+2200=2200<4400 → true
  // y=2000: 2000+2200=4200<4400 → true
  // y=4000: 4000+2200=6200>=4400 → loop exits
  // lastY = 4400-2200 = 2200
  // lastSeg.y=2000 != 2200, add at 2200
  // Total: 3 segments
  assert(result.segments.length === 3, '3 segments, no duplicates')
  const ys = result.segments.map(s => s.y)
  assert(ys.length === new Set(ys).size, 'all segment y values are unique')
}

// ── 9. All crop coordinates in bounds ─────────────────────
console.log('\n9. All crop coordinates in bounds')
{
  const widths = [1440, 390, 800]
  const heights = [1000, 2200, 4400, 8000, 15_000, 30_000]
  const segHeights = [2200, 1500, 3000]
  const overlaps = [0, 200, 300, 1500]

  async function checkBounds(W, H, SH, OV) {
    if (OV >= SH) return // skip invalid
    const buf = await createStripesBuffer(
      W,
      H,
      Math.max(2, Math.floor(H / 500))
    )
    const result = await createSegmentArtifacts(buf, {
      segmentHeight: SH,
      segmentOverlap: OV,
      quality: 82,
      format: 'jpeg'
    })

    for (const seg of result.segments) {
      assert(seg.x === 0, `bounds: x=0 (W=${W}, H=${H}, SH=${SH}, OV=${OV})`)
      assert(seg.y >= 0, `bounds: y>=0`)
      assert(seg.y + seg.height <= H + 10, `bounds: y+h <= H+tolerance`)
      assert(seg.width === W, `bounds: width=${W}`)
      assert(seg.height <= SH, `bounds: height <= segmentHeight`)
      assert(seg.buffer.length > 100, `bounds: buffer has content`)
    }
  }

  for (const W of widths) {
    for (const H of heights) {
      for (const SH of segHeights) {
        for (const OV of overlaps) {
          await checkBounds(W, H, SH, OV)
        }
      }
    }
  }
  console.log(
    `  ✅ all ${widths.length * heights.length * segHeights.length * overlaps.length} combinations in bounds`
  )
}

// ── 10. Overview preserves aspect ratio and max height ────
console.log('\n10. Overview: aspect ratio and max height')
{
  const testCases = [
    { W: 1440, H: 5000 },
    { W: 390, H: 10_000 },
    { W: 1920, H: 6000 },
    { W: 1440, H: 15_000 }
  ]

  for (const { W, H } of testCases) {
    const buf = await createStripesBuffer(W, H, 20)
    const result = await createSegmentArtifacts(buf, {
      segmentHeight: 2200,
      segmentOverlap: 300,
      quality: 82,
      format: 'jpeg'
    })

    assert(result.overview.height <= 3000, `overview height <= 3000 (H=${H})`)
    const ratio = W / H
    const expectedRatio = result.overview.width / result.overview.height
    assert(
      Math.abs(ratio - expectedRatio) < 0.01,
      `overview preserves aspect ratio (H=${H})`
    )
  }
}

// ── 11. Short overview not upscaled ───────────────────────
console.log('\n11. Short overview not upscaled')
{
  const testCases = [
    { W: 1440, H: 1000 },
    { W: 390, H: 500 },
    { W: 800, H: 2000 },
    { W: 1440, H: 3000 }
  ]

  for (const { W, H } of testCases) {
    const buf = await createStripesBuffer(W, H, 10)
    const result = await createSegmentArtifacts(buf, {
      segmentHeight: 2200,
      segmentOverlap: 300,
      quality: 82,
      format: 'jpeg'
    })

    assert(result.overview.height === H, `short overview: no upscale (H=${H})`)
    assert(
      result.overview.width === W,
      `short overview: width preserved (W=${W})`
    )
  }
}

// ── 12. Overlap content verification ──────────────────────
console.log('\n12. Overlap content verification')
{
  const segH = 2200
  const overlap = 300
  const step = segH - overlap // 1900
  const H = 6000
  const buf = await createStripesBuffer(1440, H, 40)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  // Check that adjacent segments share overlapping content
  // Segment i ends at y_i + segH, segment i+1 starts at y_{i+1}
  // Overlap region: from y_{i+1} to y_i + segH (height = overlap)
  for (let i = 0; i < result.segments.length - 1; i++) {
    const segA = result.segments[i]
    const segB = result.segments[i + 1]

    const expectedY = (i + 1) * step
    assert(segB.y === expectedY, `segment[${i + 1}] y = step * (i+1)`)

    // Verify overlap height
    const overlapStartA = segA.y + segA.height - overlap
    assert(
      segB.y === overlapStartA,
      `overlap: segment[${i + 1}] y = segment[${i}] y + height - overlap`
    )
  }
}

// ── 13. Buffer dimensions match crop ──────────────────────
console.log('\n13. Buffer dimensions match crop')
{
  const segH = 2200
  const overlap = 300
  const H = 8000
  const buf = await createStripesBuffer(1440, H, 50)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: segH,
    segmentOverlap: overlap,
    quality: 82,
    format: 'jpeg'
  })

  for (const seg of result.segments) {
    const dims = await getDimensions(seg.buffer)
    assert(
      dims.width === seg.width,
      `buffer width matches: ${dims.width} === ${seg.width}`
    )
    assert(
      dims.height === seg.height,
      `buffer height matches: ${dims.height} === ${seg.height}`
    )
  }
}

// ── 14. Overview buffer dimensions ────────────────────────
console.log('\n14. Overview buffer dimensions')
{
  // Tall page → scaled overview
  const buf = await createStripesBuffer(1440, 10_000, 50)
  const result = await createSegmentArtifacts(buf, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'jpeg'
  })

  const dims = await getDimensions(result.overview.buffer)
  assert(dims.height === 3000, `overview height = 3000 (got ${dims.height})`)
  const expectedWidth = Math.round(1440 * (3000 / 10_000))
  assert(dims.width === expectedWidth, `overview width = ${expectedWidth}`)

  // Short page → original
  const buf2 = await createStripesBuffer(800, 2000, 10)
  const result2 = await createSegmentArtifacts(buf2, {
    segmentHeight: 2200,
    segmentOverlap: 300,
    quality: 82,
    format: 'jpeg'
  })
  const dims2 = await getDimensions(result2.overview.buffer)
  assert(dims2.width === 800, 'short overview width unchanged')
  assert(dims2.height === 2000, 'short overview height unchanged')
}

// ── 15. Invalid segmentHeight/overlap validation ──────────
console.log('\n15. Validation: invalid segmentHeight/overlap')
{
  // segmentHeight must be positive integer
  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: 0,
        segmentOverlap: 0,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentHeight=0 should fail')
    } catch {
      assert(true, 'segmentHeight=0 throws')
    }
  }

  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: -100,
        segmentOverlap: 0,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentHeight=-100 should fail')
    } catch {
      assert(true, 'segmentHeight=-100 throws')
    }
  }

  // segmentOverlap must be >= 0
  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: 2200,
        segmentOverlap: -1,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentOverlap=-1 should fail')
    } catch {
      assert(true, 'segmentOverlap=-1 throws')
    }
  }

  // segmentOverlap must be < segmentHeight
  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: 2200,
        segmentOverlap: 2200,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentOverlap >= segmentHeight should fail')
    } catch {
      assert(true, 'segmentOverlap >= segmentHeight throws')
    }
  }

  // Non-integer values
  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: 2200.5,
        segmentOverlap: 300,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentHeight=2200.5 should fail')
    } catch {
      assert(true, 'segmentHeight=2200.5 throws')
    }
  }

  // Non-numeric
  {
    const buf = await createStripesBuffer(1440, 5000, 20)
    try {
      await createSegmentArtifacts(buf, {
        segmentHeight: 'abc',
        segmentOverlap: 300,
        quality: 82,
        format: 'jpeg'
      })
      assertError('segmentHeight=abc should fail')
    } catch {
      assert(true, 'segmentHeight=abc throws')
    }
  }
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
console.log(`${'='.repeat(40)}\n`)

// eslint-disable-next-line unicorn/no-process-exit
process.exit(state.failed > 0 ? 1 : 0)
