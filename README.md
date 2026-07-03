# mshot

Simple, stable full-page screenshot CLI tool.

No fancy analysis — just a fresh browser, navigate, wait, screenshot, done.

## Install

```bash
npm install -g mshot          # or
npm install mshot && npx playwright install chromium
```

## Usage

```bash
mshot --url <url> --out <file> [options]
```

### Options

| Flag                | Default      | Description                           |
| ------------------- | ------------ | ------------------------------------- |
| `--url <url>`       | _(required)_ | Target URL (http:// or https://)      |
| `--out <file>`      | _(required)_ | Output .jpg, .jpeg, .png, or .webp    |
| `--width <px>`      | `1440`       | Viewport width                        |
| `--max-height <px>` | _none_       | Crop to this height if page is taller |
| `--quality <1-100>` | `82`         | JPEG/WebP quality                     |
| `--timeout <ms>`    | `30000`      | Page load timeout                     |
| `--wait <ms>`       | `500`        | Extra wait after load                 |
| `--no-pre-scroll`   |              | Skip pre-scroll stabilization         |
| `--version`         |              | Print version                         |
| `--help`            |              | Show usage                            |

### Exit codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| `0`  | Success — path written to stdout                 |
| `1`  | Failure — `MSHOT_ERROR:` on stderr, stdout empty |

### Contract

**Success:**

```
stdout: /path/to/file.jpg
stderr: (empty or MSHOT_LIMITED: warning)
exit: 0
```

**Failure:**

```
stdout: (empty)
stderr: MSHOT_ERROR: <reason>
exit: 1
```

### Behavior

1. Launches fresh Chromium (headless)
2. Creates new context with specified viewport
3. Navigates to URL, waits `domcontentloaded`
4. Waits `networkidle` (10s fallback, proceeds anyway)
5. **Pre-scrolls** page top→bottom→top (reveals lazy/intersection content)
6. Best-effort wait for images to load
7. Extra wait (`--wait`, default 500ms) for animations
8. Captures full-page screenshot
9. If `--max-height` set and page is taller: crops to limit
10. Atomic write (tmp file → rename)
11. Auto-creates output parent directory
12. Prints path to stdout

### Examples

```bash
mshot --url https://example.com --out example.jpg
mshot --url https://example.com --out example.webp
mshot --url https://example.com --out example.jpg --max-height 20000
mshot --url https://example.com --out example.jpg --width 800 --quality 50
mshot --url https://example.com --out example.jpg --no-pre-scroll
```

## Design philosophy

> Not a smart analyzer — a dumb, stable screenshotter.

- No DOM parsing, no AI, no analysis
- One URL → one full-page screenshot
- Predictable, minimal, reliable
- Agent-safe: clean stdout/stderr contract, atomic writes
- Later: optional `--script` for interactive states (hover, menus, etc.)

## License

MIT
