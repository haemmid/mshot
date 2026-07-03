# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-07-04

### Added

- WebP output (auto by file extension)
- `--max-height` crop via sharp (page taller than limit → MSHOT_LIMITED warning)

### Fixed

- `--max-height` now correctly crops full-page screenshot (was broken with clip)

## [Unreleased]

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
