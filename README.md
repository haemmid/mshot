# mshot

Simple, stable full-page screenshot CLI tool.

> Not a smart analyzer — a dumb, reliable screenshotter. One URL → one full-page screenshot.

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

## Install

```bash
npm install -g mshot
npx playwright install chromium
```

## Usage

```bash
mshot --url <url> --out <file> [options]
```

### Options

| Flag                | Default      | Description                            |
| ------------------- | ------------ | -------------------------------------- |
| `--url <url>`       | _(required)_ | Target URL (http/https)                |
| `--out <file>`      | _(required)_ | Output path (.jpg, .jpeg, .png, .webp) |
| `--width <px>`      | `1440`       | Viewport width                         |
| `--max-height <px>` | _none_       | Crop to this height if page is taller  |
| `--quality <1-100>` | `82`         | JPEG/WebP quality                      |
| `--timeout <ms>`    | `30000`      | Page load timeout                      |
| `--wait <ms>`       | `500`        | Extra wait after load                  |
| `--no-pre-scroll`   |              | Skip pre-scroll stabilization          |

### Contract

```
Success:  stdout = path  |  stderr = empty or MSHOT_LIMITED  |  exit 0
Failure:  stdout = (empty)  |  stderr = MSHOT_ERROR: ...  |  exit 1
```

### Examples

```bash
mshot --url https://example.com --out example.jpg
mshot --url https://example.com --out example.webp --quality 50
mshot --url https://example.com --out example.jpg --max-height 20000
mshot --url https://example.com --out example.jpg --no-pre-scroll
```

## How it works

1. Fresh Chromium (headless)
2. Navigate → wait `domcontentloaded` → `networkidle`
3. **Pre-scroll** top→bottom→top (reveals lazy images, IntersectionObserver content)
4. Best-effort image load wait
5. Full-page screenshot
6. Atomic write (tmp → rename)

## Design

- **Stable over clever** — predictable behavior > smart behavior
- **Agent-safe** — clean stdout/stderr, atomic writes, no stale files
- **No DOM parsing, no AI, no analysis** — just screenshot and save

## License

MIT
