// lib/route-patterns.js — pure functions for route pattern normalization and dedup
// No I/O, no browser, no side effects.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^[0-9]+$/
const ENCODED_RE = /%[0-9a-f]{2}/i

// Convert a URL string to its route pattern.
// Numeric / UUID / long / encoded segments → :id
// Example: /project/abc123/errors → /project/:id/errors
export function urlToPattern(url) {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const patternSegments = segments.map(s => normalizeSegment(s))
    return '/' + patternSegments.join('/')
  } catch {
    return url
  }
}

function normalizeSegment(seg) {
  if (UUID_RE.test(seg)) return ':id'
  if (NUMERIC_RE.test(seg)) return ':id'
  if (seg.length > 20) return ':id'
  if (/^--.*--$/.test(seg)) return ':id'
  if (ENCODED_RE.test(seg)) return ':id'
  return seg
}

// Group links by route pattern, return representatives and duplicates.
// `links` — array of URL strings
// Returns { representatives: [{url, source}], duplicates: [{url, source, reason, pattern}] }
export function dedupeByPattern(links, routeDedupe, maxPerPattern) {
  if (!routeDedupe) {
    return {
      representatives: links.map(l => ({ url: l, source: 'rendered-link' })),
      duplicates: []
    }
  }

  const patternCount = new Map()
  const representatives = []
  const duplicates = []

  for (const link of links) {
    const pattern = urlToPattern(link)
    const count = patternCount.get(pattern) || 0

    if (count < maxPerPattern) {
      patternCount.set(pattern, count + 1)
      representatives.push({ url: link, source: 'rendered-link' })
    } else {
      duplicates.push({
        url: link,
        source: 'rendered-link',
        reason: 'duplicate-pattern',
        pattern
      })
    }
  }

  return { representatives, duplicates }
}
