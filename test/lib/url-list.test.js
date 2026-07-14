// test/lib/url-list.test.js — unit tests for url-list helpers
// Usage: node test/lib/url-list.test.js

import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readUrlsFile, filterDuplicateCandidates } from '../../lib/url-list.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TMP = join(__dirname, '..', '..', '.tmp-url-list-test')

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

function setup() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
}

function cleanup() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
}

function existsSync(p) {
  try {
    return readFileSync(p, 'utf8') // just a quick check
  } catch {
    return false
  }
}

setup()

// ── readUrlsFile: comments and blank lines ────────────────
console.log('\nreadUrlsFile — comments and blanks')
{
  const filePath = join(TMP, 'comments.txt')
  writeFileSync(
    filePath,
    `# header comment

# another comment

/
  /projects  
/project/demo

# trailing comment

`
  )
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls.length === 3, '3 URLs parsed')
  assert(result.urls[0].url === 'http://localhost:4321/', 'first is /')
  assert(
    result.urls[1].url === 'http://localhost:4321/projects',
    'second is /projects'
  )
  assert(
    result.urls[2].url === 'http://localhost:4321/project/demo',
    'third is /project/demo'
  )
  assert(result.urls[0].source === 'input', 'source is input')
  assert(result.skipped.length === 0, 'no skipped')
}

// ── readUrlsFile: relative paths ──────────────────────────
console.log('\nreadUrlsFile — relative paths')
{
  const filePath = join(TMP, 'relative.txt')
  writeFileSync(filePath, '/\n/settings\n/project/demo/errors\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls[0].url === 'http://localhost:4321/', 'relative / resolved')
  assert(
    result.urls[1].url === 'http://localhost:4321/settings',
    '/settings resolved'
  )
  assert(
    result.urls[2].url === 'http://localhost:4321/project/demo/errors',
    '/project/demo/errors resolved'
  )
}

// ── readUrlsFile: same-origin absolute URL ────────────────
console.log('\nreadUrlsFile — same-origin absolute URL')
{
  const filePath = join(TMP, 'same-origin.txt')
  writeFileSync(
    filePath,
    'http://localhost:4321/settings\nhttp://localhost:4321/admin\n'
  )
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls.length === 2, '2 same-origin URLs')
  assert(
    result.urls[0].url === 'http://localhost:4321/settings',
    'http same-origin'
  )
  assert(
    result.urls[1].url === 'http://localhost:4321/admin',
    'http same-origin admin'
  )
}

// ── readUrlsFile: external origin skipped ─────────────────
console.log('\nreadUrlsFile — external origin skipped')
{
  const filePath = join(TMP, 'external.txt')
  writeFileSync(
    filePath,
    '/\nhttps://external.example/page\nhttp://other.com/foo\n'
  )
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error from parser')
  assert(result.urls.length === 1, '1 URL (external skipped)')
  assert(result.urls[0].url === 'http://localhost:4321/', 'only / captured')
  assert(result.skipped.length === 2, '2 skipped')
  assert(
    result.skipped[0].reason === 'external-origin',
    'first skip reason is external-origin'
  )
  assert(
    result.skipped[1].reason === 'external-origin',
    'second skip reason is external-origin'
  )
}

// ── readUrlsFile: non-http protocol skipped ───────────────
console.log('\nreadUrlsFile — non-http protocol skipped')
{
  const filePath = join(TMP, 'protocols.txt')
  writeFileSync(filePath, '/\nftp://localhost:4321/file\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls.length === 1, '1 URL')
  assert(result.skipped.length === 1, '1 skipped')
  assert(
    result.skipped[0].reason === 'non-http-protocol',
    'skip reason is non-http-protocol'
  )
}

// ── readUrlsFile: hash removal ────────────────────────────
console.log('\nreadUrlsFile — hash removal')
{
  const filePath = join(TMP, 'hash.txt')
  writeFileSync(filePath, '/page#section\n/settings#top\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(
    result.urls[0].url === 'http://localhost:4321/page',
    'hash removed from /page#section'
  )
  assert(
    result.urls[1].url === 'http://localhost:4321/settings',
    'hash removed from /settings#top'
  )
}

// ── readUrlsFile: exact duplicate removal ─────────────────
console.log('\nreadUrlsFile — exact duplicate removal')
{
  const filePath = join(TMP, 'dups.txt')
  writeFileSync(filePath, '/projects\n/projects\n/project/a\n/project/a\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls.length === 2, '2 unique URLs')
  assert(result.urls[0].url === 'http://localhost:4321/projects', 'first kept')
  assert(
    result.urls[1].url === 'http://localhost:4321/project/a',
    'second kept'
  )
}

// ── readUrlsFile: missing file ────────────────────────────
console.log('\nreadUrlsFile — missing file')
{
  const result = readUrlsFile(
    '/tmp/does-not-exist-mshot.txt',
    'http://localhost:4321'
  )
  assert(
    result.error === 'urls-file not found: /tmp/does-not-exist-mshot.txt',
    'urls-file not found error'
  )
}

// ── readUrlsFile: file cannot be read ─────────────────────
console.log('\nreadUrlsFile — file cannot be read')
{
  // Create a file and remove read permissions
  const filePath = join(TMP, 'unreadable.txt')
  writeFileSync(filePath, '/\n')
  // On non-root, we can't easily test permission denied, but we can test a directory
  const result = readUrlsFile(TMP, 'http://localhost:4321')
  assert(
    result.error && result.error.startsWith('cannot read urls-file:'),
    'cannot read error for directory'
  )
}

// ── readUrlsFile: mixed absolute + relative ───────────────
console.log('\nreadUrlsFile — mixed absolute + relative')
{
  const filePath = join(TMP, 'mixed.txt')
  writeFileSync(filePath, '/\nhttp://localhost:4321/api\n/settings\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(result.urls.length === 3, '3 URLs')
  assert(result.urls[0].url === 'http://localhost:4321/', 'base /')
  assert(
    result.urls[1].url === 'http://localhost:4321/api',
    'absolute same-origin'
  )
  assert(
    result.urls[2].url === 'http://localhost:4321/settings',
    'relative /settings'
  )
}

// ── readUrlsFile: absolute URL with query string ──────────
console.log('\nreadUrlsFile — query string preserved, hash removed')
{
  const filePath = join(TMP, 'query.txt')
  writeFileSync(filePath, '/search?q=test#hash\n')
  const result = readUrlsFile(filePath, 'http://localhost:4321')
  assert(!result.error, 'no error')
  assert(
    result.urls[0].url === 'http://localhost:4321/search?q=test',
    'query preserved, hash removed'
  )
}

// ── filterDuplicateCandidates ─────────────────────────────
console.log('\nfilterDuplicateCandidates')
{
  const inputUrls = [
    { url: 'http://localhost:4321/', source: 'input' },
    { url: 'http://localhost:4321/projects', source: 'input' }
  ]
  const candidates = [
    { url: 'http://localhost:4321/projects', source: 'rendered-link' },
    { url: 'http://localhost:4321/about', source: 'rendered-link' },
    { url: 'http://localhost:4321/settings', source: 'rendered-link' }
  ]
  const result = filterDuplicateCandidates(inputUrls, candidates)
  assert(result.length === 2, '2 candidates after filtering')
  assert(
    result[0].url === 'http://localhost:4321/about',
    'about kept (not in input)'
  )
  assert(
    result[1].url === 'http://localhost:4321/settings',
    'settings kept (not in input)'
  )
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
console.log(`${'='.repeat(40)}\n`)

cleanup()
// eslint-disable-next-line unicorn/no-process-exit
process.exit(state.failed > 0 ? 1 : 0)
