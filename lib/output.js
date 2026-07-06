// lib/output.js — file output helpers
// No Playwright imports. No stdout.

import {
  createWriteStream,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  readFileSync
} from 'node:fs'
import { resolve, extname, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── createOutputDir(path) ─────────────────────────────────
export function createOutputDir(path) {
  try {
    mkdirSync(path, { recursive: true })
    return true
  } catch {
    return false
  }
}

// ── writeBuffer(buffer, outPath) → { path, size } | null ──
export async function writeBuffer(buffer, outPath) {
  const tmpFile = outPath + '.tmp-' + randomUUID()
  let stream = null

  try {
    stream = createWriteStream(tmpFile)
    stream.write(buffer)
    stream.end()

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    renameSync(tmpFile, outPath)
    return { path: outPath, size: statSync(outPath).size }
  } catch {
    // Clean up tmp on failure
    if (stream) {
      try {
        unlinkSync(tmpFile)
      } catch {}
    }
    return null
  }
}

// ── urlToSafeName(url) → string ───────────────────────────
export function urlToSafeName(url) {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname
      .split('?')[0]
      .split('#')[0]
      .replace(/^[\/]+/, '') // strip leading slashes
      .replaceAll(/[\/]+/g, '-') // slashes → hyphens
      .replaceAll(/[^a-zA-Z0-9\-]/g, '') // remove unsafe chars
      .replaceAll(/-+/g, '-') // collapse hyphens
      .replace(/-$/, '') // trailing hyphen

    if (!path) path = 'home'
    return path
  } catch {
    return 'unknown-' + randomUUID().slice(0, 8)
  }
}

// ── safeFilename(url, viewportName, ext) → string ─────────
export function safeFilename(url, viewportName, ext = '.jpg') {
  return urlToSafeName(url) + '-' + viewportName + ext
}

// ── screenshotPath(outDir, url, viewportName, ext) ────────
export function screenshotPath(outDir, url, viewportName, ext) {
  return join(outDir, safeFilename(url, viewportName, ext))
}
