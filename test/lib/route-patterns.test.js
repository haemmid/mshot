// test/lib/route-patterns.test.js — unit tests for pure route-pattern helpers
// Usage: node test/lib/route-patterns.test.js

import { urlToPattern, dedupeByPattern } from '../../lib/route-patterns.js'

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

// ── urlToPattern ──────────────────────────────────────────
console.log('\nurlToPattern')
{
  assert(
    urlToPattern('http://x/project/123') === '/project/:id',
    'numeric → :id'
  )
  assert(
    urlToPattern('http://x/project/550e8400-e29b-41d4-a716-446655440000') ===
      '/project/:id',
    'UUID → :id'
  )
  assert(
    urlToPattern('http://x/project/--home-user-super-long-encoded-name--') ===
      '/project/:id',
    'long encoded → :id'
  )
  assert(
    urlToPattern('http://x/project/--home-user-short--') === '/project/:id',
    '--...-- pattern → :id'
  )
  assert(
    urlToPattern('http://x/project/123/errors') === '/project/:id/errors',
    'nested path with id → /project/:id/errors'
  )
  assert(
    urlToPattern('http://x/project/foo?q=1') === '/project/foo',
    'query string stripped'
  )
  assert(
    urlToPattern('http://x/settings') === '/settings',
    'static route unchanged'
  )
  assert(urlToPattern('http://x/') === '/', 'root stays /')
  assert(
    urlToPattern('http://x/project/foo%20bar') === '/project/:id',
    'encoded segment → :id'
  )
  // short alpha stays as-is
  assert(
    urlToPattern('http://x/project/foo') === '/project/foo',
    'short alpha stays'
  )
}

// ── dedupeByPattern ───────────────────────────────────────
console.log('\ndedupeByPattern')
{
  // All same pattern (numeric segments)
  const links = [
    'http://x/project/1',
    'http://x/project/2',
    'http://x/project/3'
  ]

  // Default: maxPerPattern=1, routeDedupe=true
  {
    const result = dedupeByPattern(links, true, 1)
    assert(result.representatives.length === 1, '1 representative')
    assert(
      result.representatives[0].url === 'http://x/project/1',
      'first is representative'
    )
    assert(result.duplicates.length === 2, '2 duplicates')
    assert(
      result.duplicates[0].reason === 'duplicate-pattern',
      'reason is duplicate-pattern'
    )
    assert(
      result.duplicates[0].pattern === '/project/:id',
      'pattern is /project/:id'
    )
  }

  // maxPerPattern=2
  {
    const result = dedupeByPattern(links, true, 2)
    assert(result.representatives.length === 2, '2 representatives')
    assert(result.duplicates.length === 1, '1 duplicate')
  }

  // No dedupe
  {
    const result = dedupeByPattern(links, false, 1)
    assert(result.representatives.length === 3, 'all 3 are representatives')
    assert(result.duplicates.length === 0, 'no duplicates')
  }

  // Different patterns
  {
    const links2 = [
      'http://x/project/1',
      'http://x/project/2',
      'http://x/settings'
    ]
    const result = dedupeByPattern(links2, true, 1)
    assert(
      result.representatives.length === 2,
      '2 representatives (different patterns)'
    )
    assert(result.duplicates.length === 1, '1 duplicate')
  }
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
console.log(`${'='.repeat(40)}\n`)

// eslint-disable-next-line unicorn/no-process-exit
process.exit(state.failed > 0 ? 1 : 0)
