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

// ── writeBufferSet(files, outDir) → { paths: string[], size: number } | null ──
//
// Atomically writes a set of files (overview + segments) for one route+viewport.
// All temp files are written first, then atomically renamed.
// On failure, all temp files are cleaned up.
//
// @param {Array<{ path: string, buffer: Buffer }>} files
// @param {string} outDir
// @returns {{ paths: string[], totalSize: number } | null}
export async function writeBufferSet(files, outDir) {
  const tmpFiles = []
  const results = []

  try {
    // Phase 1: write all files as temp
    for (const file of files) {
      const tmpPath = file.path + '.tmp-' + randomUUID()
      tmpFiles.push(tmpPath)

      const buffer = await writeFileAtomic(tmpPath, file.buffer)
      results.push({ tmpPath, outputPath: file.path, size: buffer.size })
    }

    // Phase 2: rename all atomically
    for (const result of results) {
      renameSync(result.tmpPath, result.outputPath)
    }

    return {
      paths: results.map(r => r.outputPath),
      totalSize: results.reduce((sum, r) => sum + r.size, 0)
    }
  } catch {
    // Cleanup: all temp files + any already-renamed final files
    for (const tmp of tmpFiles) {
      try {
        unlinkSync(tmp)
      } catch {}
    }
    for (const result of results) {
      try {
        if (existsSync(result.outputPath)) {
          unlinkSync(result.outputPath)
        }
      } catch {}
    }
    return null
  }
}

// ── writeFileAtomic(tmpPath, buffer) → { size: number } ──
async function writeFileAtomic(tmpPath, buffer) {
  let stream = null

  try {
    stream = createWriteStream(tmpPath)
    stream.write(buffer)
    stream.end()

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    return { size: statSync(tmpPath).size }
  } catch {
    try {
      unlinkSync(tmpPath)
    } catch {}
    throw new Error(`failed to write ${tmpPath}`)
  }
}

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
