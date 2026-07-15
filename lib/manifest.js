// lib/manifest.js — manifest creation, update, and write helpers
// No Playwright, no screenshot logic.

import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

// Create a new manifest record from a captured page
export function createPageRecord(pageEntry, screenshots, timings) {
  return {
    url: pageEntry.url,
    source: pageEntry.source,
    screenshots,
    timings: timings || {}
  }
}

// Create a segmented page record (adds screenshots, segments, overview)
export function createSegmentedPageRecord(
  pageEntry,
  screenshots,
  segments,
  overview,
  timings
) {
  return {
    url: pageEntry.url,
    source: pageEntry.source,
    screenshots,
    segments,
    overview,
    timings: timings || {}
  }
}

// Build segments metadata array from segment artifacts
export function buildSegmentsMetadata(viewportName, segmentArtifacts) {
  return segmentArtifacts.map(seg => ({
    file: seg.filename,
    x: seg.x,
    y: seg.y,
    width: seg.width,
    height: seg.height
  }))
}

// Build overview metadata object
export function buildOverviewMetadata(viewportName, overviewArtifact) {
  return {
    file: overviewArtifact.filename,
    sourceWidth: overviewArtifact.sourceWidth,
    sourceHeight: overviewArtifact.sourceHeight,
    width: overviewArtifact.width,
    height: overviewArtifact.height
  }
}

// Create a skipped-page record (capture failure)
export function createSkipRecord(pageEntry, reason) {
  return {
    url: pageEntry.url,
    source: pageEntry.source,
    reason: reason.slice(0, 100)
  }
}

// Create a deduplication skipped record
export function createDedupSkipRecord(pageEntry, pattern) {
  return {
    url: pageEntry.url,
    source: pageEntry.source,
    reason: 'duplicate-pattern',
    pattern
  }
}

// Build the full manifest object
export function buildManifest(baseUrl, viewports, pages, skipped) {
  return {
    manifestVersion: 1,
    baseUrl,
    createdAt: new Date().toISOString(),
    viewports: Object.fromEntries(
      viewports.map(vp => [vp.name, { width: vp.width }])
    ),
    pages,
    skipped
  }
}

// Write manifest to disk
export function writeManifest(outDir, manifest) {
  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return manifestPath
}
