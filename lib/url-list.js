// lib/url-list.js — read and normalize urls-file
// Pure functions: no I/O, no browser, no side effects.

import { readFileSync } from 'node:fs'

// Read urls-file, parse and normalize entries.
// Returns { urls: [{url, source}], skipped: [{url, source, reason}] }
export function readUrlsFile(filePath, baseUrl) {
  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `urls-file not found: ${filePath}` }
    }
    return { error: `cannot read urls-file: ${filePath}` }
  }

  const lines = content.split('\n')
  const baseOrigin = new URL(baseUrl).origin

  const seenUrls = new Set()
  const urls = []
  const skipped = []

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue

    let resolvedUrl

    // Relative path → resolve against baseUrl
    if (line.startsWith('/')) {
      resolvedUrl = baseOrigin + line
    } else {
      // Try parsing as absolute URL
      try {
        const parsed = new URL(line)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          skipped.push({
            url: line,
            source: 'input',
            reason: 'non-http-protocol'
          })
          continue
        }
        if (parsed.origin !== baseOrigin) {
          skipped.push({
            url: line,
            source: 'input',
            reason: 'external-origin'
          })
          continue
        }
        resolvedUrl = parsed.origin + parsed.pathname + parsed.search
      } catch {
        // Treat as relative path
        resolvedUrl = baseOrigin + '/' + line
      }
    }

    // Remove hash
    resolvedUrl = resolvedUrl.split('#')[0]

    // Dedup exact duplicates
    if (seenUrls.has(resolvedUrl)) continue
    seenUrls.add(resolvedUrl)

    urls.push({ url: resolvedUrl, source: 'input' })
  }

  return { urls, skipped }
}

// Filter out URLs already covered by explicit input URLs.
// inputUrls — array of {url, source} (the explicit ones)
// candidates — array of {url, source} (discovered, to be filtered)
export function filterDuplicateCandidates(inputUrls, candidates) {
  const inputSet = new Set(inputUrls.map(u => u.url))
  return candidates.filter(c => !inputSet.has(c.url))
}
