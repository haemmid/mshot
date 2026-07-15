// lib/segments.js — pure image processing via Sharp
// Receives a full-page buffer. Returns overview + segments buffers + metadata.
//
// No Playwright imports. No file I/O. No stdout.
//
// Exports: createSegmentArtifacts(buffer, options) → { overview, segments }

import sharp from 'sharp'

const OVERVIEW_MAX_HEIGHT = 3000

// ── createSegmentArtifacts(buffer, options) → { overview, segments } ──
//
// Creates an overview thumbnail and a sequence of overlapping segments
// from a single full-page capture buffer.
//
// @param {Buffer} buffer — full-page JPEG/PNG/WebP buffer
// @param {Object} options
// @param {number} options.segmentHeight — segment height in px (positive integer)
// @param {number} options.segmentOverlap — overlap between segments (>= 0, < segmentHeight)
// @param {number} [options.quality] — JPEG/WebP quality (default: 82)
// @param {string} [options.format] — output format: 'jpeg' | 'png' | 'webp' (default: 'jpeg')
//
// @returns {{ overview: { buffer, width, height, sourceWidth, sourceHeight }, segments: Array<{ buffer, x, y, width, height, index }> }}
export async function createSegmentArtifacts(buffer, opts) {
  const segmentHeight = opts.segmentHeight
  const segmentOverlap = opts.segmentOverlap
  validateSegments(segmentHeight, segmentOverlap)
  const quality = opts.quality ?? 82
  const format = opts.format ?? 'jpeg'

  // Get source dimensions
  const metadata = await sharp(buffer).metadata()
  const sourceWidth = metadata.width
  const sourceHeight = metadata.height

  // ── Create overview ─────────────────────────────────────
  const overview = await createOverview(
    buffer,
    sourceWidth,
    sourceHeight,
    quality,
    format
  )

  // ── Create segments ─────────────────────────────────────
  const segments = await createSegments(
    buffer,
    sourceWidth,
    sourceHeight,
    segmentHeight,
    segmentOverlap,
    quality,
    format
  )

  return { overview, segments }
}

// ── createOverview(buffer, sourceWidth, sourceHeight, quality, format) ──
async function createOverview(
  buffer,
  sourceWidth,
  sourceHeight,
  quality,
  format
) {
  if (sourceHeight <= OVERVIEW_MAX_HEIGHT) {
    // Short page: keep as-is (no upscale)
    return {
      buffer,
      width: sourceWidth,
      height: sourceHeight,
      sourceWidth,
      sourceHeight
    }
  }

  // Scale down to fit within OVERVIEW_MAX_HEIGHT while preserving aspect ratio
  const scale = OVERVIEW_MAX_HEIGHT / sourceHeight
  const width = Math.round(sourceWidth * scale)
  const height = OVERVIEW_MAX_HEIGHT

  let pipeline = sharp(buffer).resize({
    width,
    height,
    fit: 'inside',
    withoutEnlargement: false
  })
  pipeline = applyFormat(pipeline, format, quality)

  const overviewBuffer = await pipeline.toBuffer()

  return {
    buffer: overviewBuffer,
    width,
    height,
    sourceWidth,
    sourceHeight
  }
}

// ── createSegments(buffer, sourceWidth, sourceHeight, segmentHeight, segmentOverlap, quality, format) ──
async function createSegments(
  buffer,
  sourceWidth,
  sourceHeight,
  segmentHeight,
  segmentOverlap,
  quality,
  format
) {
  const segments = []
  let step = segmentHeight - segmentOverlap

  if (step <= 0) {
    // overlap >= segmentHeight: invalid, but caller should validate
    // fall back to no overlap
    step = segmentHeight
  }

  // For pages shorter than or equal to segmentHeight: create one segment of the full page
  if (sourceHeight <= segmentHeight) {
    segments.push({
      buffer,
      x: 0,
      y: 0,
      width: sourceWidth,
      height: sourceHeight,
      index: 1
    })
    return segments
  }

  // Build segments with step offset
  let y = 0
  let index = 1

  while (y + segmentHeight < sourceHeight) {
    segments.push({
      buffer: null, // placeholder — filled below
      x: 0,
      y,
      width: sourceWidth,
      height: segmentHeight,
      index
    })
    y += step
    index++
  }

  // Last segment: ensure it covers the bottom without duplicating
  // Position so it ends exactly at sourceHeight (or starts at H - S if that's before the loop's last y)
  const lastY = Math.max(0, sourceHeight - segmentHeight)

  // Check if the last loop iteration already placed a segment ending at or past the bottom
  if (segments.length > 0) {
    const lastSeg = segments.at(-1)
    const lastEnd = lastSeg.y + segmentHeight
    if (lastEnd >= sourceHeight) {
      // Last loop segment already covers the bottom — adjust its y to avoid overlap gap
      // but keep the segment at its original position (no duplicate)
      // Actually, the loop condition is y + S < H, so the last iteration placed a segment
      // that starts before H - S. We need to ensure the final segment covers H - S to H.
      // If the last segment's end >= H, it already covers the bottom.
      // But we still need a final segment at lastY to ensure no gap.
      // Check for gap: if lastSeg.y + step <= lastY, there's a gap.
      // The algorithm ensures no gap because step < segmentHeight.
      // We just need to make sure the last segment doesn't duplicate the previous one.
      if (lastSeg.y === lastY) {
        // Exact duplicate — remove it
        segments.pop()
      }
      // Add the final segment
      segments.push({
        buffer: null,
        x: 0,
        y: lastY,
        width: sourceWidth,
        height: segmentHeight,
        index: index
      })
    } else {
      // Last loop segment doesn't reach the bottom — add final segment
      segments.push({
        buffer: null,
        x: 0,
        y: lastY,
        width: sourceWidth,
        height: segmentHeight,
        index: index
      })
    }
  } else {
    // No segments from loop (shouldn't happen if sourceHeight > segmentHeight),
    // but safety fallback
    segments.push({
      buffer: null,
      x: 0,
      y: lastY,
      width: sourceWidth,
      height: segmentHeight,
      index: index
    })
  }

  // Now crop each segment from the buffer
  const cropped = []
  for (const seg of segments) {
    let pipeline = sharp(buffer).extract({
      left: seg.x,
      top: seg.y,
      width: seg.width,
      height: seg.height
    })
    pipeline = applyFormat(pipeline, format, quality)
    seg.buffer = await pipeline.toBuffer()
    cropped.push(seg)
  }

  return cropped
}

// ── applyFormat(pipeline, format, quality) ──────────────────
function applyFormat(pipeline, format, quality) {
  if (format === 'webp') {
    return pipeline.webp({ quality })
  }
  if (format === 'png') {
    return pipeline.png()
  }
  return pipeline.jpeg({ quality })
}

// ── validateSegments(segmentHeight, segmentOverlap) ─────────
function validateSegments(segmentHeight, segmentOverlap) {
  if (!Number.isSafeInteger(segmentHeight) || segmentHeight <= 0) {
    throw new Error(
      `segmentHeight must be a positive integer, got ${segmentHeight}`
    )
  }
  if (!Number.isSafeInteger(segmentOverlap) || segmentOverlap < 0) {
    throw new Error(
      `segmentOverlap must be a non-negative integer, got ${segmentOverlap}`
    )
  }
  if (segmentOverlap >= segmentHeight) {
    throw new Error(
      `segmentOverlap (${segmentOverlap}) must be less than segmentHeight (${segmentHeight})`
    )
  }
}
