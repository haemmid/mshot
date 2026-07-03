# mshot

Simple, stable full-page screenshot CLI tool.

No fancy analysis — just a fresh browser, navigate, wait, screenshot, done.

## Install

```bash
npm install -g mshot          # or
npm install mshot && npx playwright install --with-deps
```

## Usage

```bash
mshot --url <url> --out <file> \
  [--width 1440] \
  [--quality 82] \
  [--timeout 30000] \
  [--max-height 20000]
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | _(required)_ | Target URL |
| `--out` | _(required)_ | Output file path |
| `--width` | `1440` | Viewport width in px |
| `--quality` | `82` | JPEG quality (0–100) |
| `--timeout` | `30000` | Navigation timeout in ms |
| `--max-height` | _none_ | Crop to this height (px) if page is taller |

### Exit codes

- `0` — success, path written to stdout
- `1` — failure, diagnostics on stderr

### Behavior

1. Launches fresh Chromium (headless)
2. Creates new context with specified viewport
3. Navigates to URL, waits `domcontentloaded`
4. Waits `networkidle` (10s fallback, proceeds anyway)
5. Captures full-page screenshot (JPEG or WebP by extension)
6. If `--max-height` set and page is taller: crops to limit
7. Writes file, prints path to stdout

### Example

```bash
mshot --url https://example.com --out example.jpg
# → /home/user/example.jpg
```

With height limit:

```bash
mshot --url https://longpage.com --out page.jpg --max-height 20000
# → MSHOT_LIMITED: page height 42000px, captured first 20000px
```

WebP output:

```bash
mshot --url https://example.com --out example.webp
# → auto-detects format from extension
```

## Design philosophy

> Not a smart analyzer — a dumb, stable screenshotter.

- No DOM parsing, no AI, no analysis
- One URL → one full-page screenshot
- Predictable, minimal, reliable
- Later: optional `--script` for interactive states (hover, menus, etc.)

## License

MIT
