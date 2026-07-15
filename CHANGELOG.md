# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] — 2026-07-15

### Added

- `--segments` flag for batch mode — creates overview thumbnail + overlapping segments from a single capture
- `--segment-height <px>` — segment height in pixels (default 2200)
- `--segment-overlap <px>` — overlap between adjacent segments (default 300)
- `lib/segments.js` — pure image processing module using Sharp for overview/segmentation
- `lib/output.js` — `writeBufferSet()` for atomic multi-file writes
- `lib/manifest.js` — `createSegmentedPageRecord()`, `buildSegmentsMetadata()`, `buildOverviewMetadata()`
- Segmented manifest fields: `segments[viewport][]` with `{ file, x, y, width, height }`
- Segmented manifest fields: `overview[viewport]` with `{ file, sourceWidth, sourceHeight, width, height }`
- Post-processing timings: `overviewMs`, `segmentationMs`, `outputMs`
- `test/lib/segments.test.js` — 10000+ unit tests for segmentation math and image processing
- `test/smoke/full.mjs` — segments CLI smoke tests (validation, basic, --max-height)

### Changed

- Batch manifest `screenshots[viewport]` now points to overview file when `--segments` is used
- `totalMs` now includes post-processing time when segments are enabled
- Segmentation uses only Sharp post-processing — no additional browser captures

### Fixed

- `--segment-height` and `--segment-overlap` now properly validated (must be integers, overlap < height)
- Missing `join` import in `lib/batch.js` caused silent capture failures

## [0.7.0] — 2026-07-15

### Added

- `lib/settle.js` — best-effort font and image settling before screenshot
- `--no-settle` flag to disable font/image settle and animation normalization
- `--settle-timeout <ms>` to control settle timeout ceiling (default 3000)
- `fontWaitMs` and `imageWaitMs` timing fields in batch manifest
- `test/smoke/settle.mjs` — settle integration tests with fixture pages
- Fixture pages: IntersectionObserver reveal, font ready, slow image, finite animation, infinite animation

### Changed

- `capturePage()` pipeline: navigate → networkidle → pre-scroll → settle → wait → screenshot
- Screenshot now uses `animations: 'disabled'` when settle is enabled
- `--no-pre-scroll` no longer implicitly disables font/image settle
- `--settle-timeout` is a ceiling, not a fixed sleep — returns early when resources are ready
- `networkidleTimeout` now available in single mode (`--networkidle-timeout`)

### Fixed

- Playwright `page.screenshot()` unbounded font wait when slow `<img>` or `<font>` request is pending
  — bypassed via `PW_TEST_SCREENSHOT_NO_FONTS_READY=1` (mshot performs its own bounded settle wait)

## [0.6.1] — 2026-07-07

### Fixed

- `package.json.files` — добавлен `"lib/"`, опубликованный пакет теперь содержит модули
- CLI help — `--max-pages` показывал `default 1440` (копировал `DEFAULTS.width`), исправлено на `default 12`
- Убран дублирующий `--route-dedupe` из `parseArgsConfig`, публично документирован только `--no-route-dedupe`

### Added

- `manifestVersion: 1` в `manifest.json` для будущей эволюции формата

## [0.6.0] — 2026-07-07

### Added

- `--urls-file <file>` for deterministic batch capture by explicit URL/path list
- Plain text urls-file: one URL or path per line, comments (`#`), blank lines supported
- `source: "input"` in manifest for URLs from `--urls-file`
- `manifest.json` `skipped[]` entries for external-origin, non-http, and `max-pages` overflow
- `filterDuplicateCandidates()` to prevent input URLs from being deduped by discovered URLs
- Unit tests for `lib/url-list.js` (comments, blanks, relative paths, same-origin, external, hash removal, duplicates)

### Changed

- Explicit input URLs are captured first and are never removed by route pattern deduplication
- `--discover` fills remaining `--max-pages` slots after input URLs
- `--max-pages` overflow now records `reason: "max-pages"` in `skipped[]`

## [0.5.0] — 2026-07-06

### Added

- `batch` subcommand for multi-page capture
- `--out-dir <dir>` required for batch mode
- `--viewports <list>` comma-separated viewports (desktop, mobile)
- `--discover` rendered-link discovery from base page
- `--max-pages <n>` limit discovered pages (default 12)
- `--concurrency <n>` parallel captures (default 2)
- `manifest.json` output with page metadata and screenshot paths
- `MSHOT_WARN:` for skipped pages and recoverable issues
- `urlToSafeName()` for deterministic screenshot filenames

### Changed

- Single mode now uses shared `capturePage()` core logic

## [0.4.0] — 2026-07-04

### Added

- Default pre-scroll stabilization before full-page screenshot
- `--no-pre-scroll` flag to disable pre-scroll
- Best-effort image wait after scroll
- Scroll diagnostics: `MSHOT_SCROLL:` and `MSHOT_SCROLL_LIMITED:` on stderr
- Scroll caps at 30000px to prevent hangs on extremely tall pages

## [0.3.0] — 2026-07-04

### Added

- `--help` and `--version` flags
- `--wait <ms>` extra wait after load (default 500)
- PNG output support
- URL validation (http/https only)
- Output extension validation (.jpg, .jpeg, .png, .webp)
- Auto-create output parent directory
- Atomic output write (tmp file + rename)
- Clean MSHOT_ERROR messages on stderr
- Empty stdout on failure
- MSHOT_LIMITED on stderr for cropped pages

### Changed

- Removed progress logs from stderr (cleaner contract)
- All errors prefixed with MSHOT_ERROR: on stderr

## [0.2.0] — 2026-07-04

### Added

- WebP output (auto by file extension)
- `--max-height` crop via sharp (page taller than limit → MSHOT_LIMITED warning)

### Fixed

- `--max-height` now correctly crops full-page screenshot (was broken with clip)

## [0.1.0] — 2026-07-04

### Added

- Initial release
- Full-page screenshot via Chromium (headless)
- CLI flags: `--url`, `--out`, `--width`, `--quality`, `--timeout`
- Optional `--max-height` with `MSHOT_LIMITED` warning
- `networkidle` wait with 10s fallback
- stdout = output path, stderr = diagnostics
- Non-zero exit on failure
- Postinstall browser setup script
