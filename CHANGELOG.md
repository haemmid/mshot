# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
