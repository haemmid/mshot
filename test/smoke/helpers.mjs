// test/smoke/helpers.mjs — shared helpers for smoke tests
// No browser, no side effects.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MSHOT = join(__dirname, '..', '..', 'mshot.js')

export { MSHOT }

// ── Temp dir management ───────────────────────────────────
export function createTempDir(prefix) {
  const tmp = join(
    dirname(MSHOT),
    `.tmp-smoke-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(tmp, { recursive: true })
  return tmp
}

export function removeTempDir(tmp) {
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ── CLI runner ────────────────────────────────────────────
/**
 * Run mshot CLI synchronously. Throws on non-zero exit.
 * @param {string[]} args
 * @returns {string} stdout
 */
export function runCli(args) {
  const result = execFileSync('node', [MSHOT, ...args], {
    cwd: join(dirname(MSHOT)),
    encoding: 'utf8',
    timeout: 30_000
  })
  return result
}

/**
 * Run mshot CLI synchronously, capture both stdout and stderr.
 * Returns { stdout, stderr, exitCode } — never throws.
 * @param {string[]} args
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
export function runCliErr(args) {
  try {
    const result = execFileSync('node', [MSHOT, ...args], {
      cwd: join(dirname(MSHOT)),
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return { stdout: result.stdout, stderr: '', exitCode: 0 }
  } catch (e) {
    return {
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || '',
      exitCode: e.status || 1
    }
  }
}

// ── Assertions ────────────────────────────────────────────
export function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    throw new Error(`Assertion failed: ${label}`)
  }
}

export function assertExit(code, expected, label) {
  assert(code === expected, `${label}: exit ${code} === ${expected}`)
}

export function assertStdoutEmpty(stdout, label) {
  assert(stdout.trim() === '', `${label}: stdout is empty`)
}

export function assertStderrHas(stderr, needle, label) {
  assert(stderr.includes(needle), `${label}: stderr contains "${needle}"`)
}

export function assertFileExists(path, label) {
  assert(existsSync(path), `${label}: file exists at ${path}`)
}

export function assertFileSize(path, expected, label) {
  const s = statSync(path)
  assert(s.size === expected, `${label}: file size ${s.size} === ${expected}`)
}

export function writeTempFile(tmp, name, content) {
  const path = join(tmp, name)
  writeFileSync(path, content)
  return path
}

// ── Manifest helpers ──────────────────────────────────────
export function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

export function assertManifestHas(manifest, expectedPages, label) {
  assert(
    manifest.pages && manifest.pages.length >= expectedPages,
    `${label}: manifest has ${manifest.pages?.length ?? 0} >= ${expectedPages} pages`
  )
}

export function assertManifestVersion(manifest, label) {
  assert(manifest.manifestVersion === 1, `${label}: manifestVersion === 1`)
}
