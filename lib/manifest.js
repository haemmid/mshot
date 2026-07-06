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
