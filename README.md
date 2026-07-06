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
mshot batch --url <url> --out-dir <dir> [options]
```

### Single Mode

Capture a single page:

```bash
mshot --url https://example.com --out screenshot.jpg
```

### Batch Mode

Capture multiple pages with link discovery:

```bash
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --discover --max-pages 12
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --viewports desktop,mobile --max-height 900
```

### Options

| Flag                 | Default      | Description                            |
| -------------------- | ------------ | -------------------------------------- |
| `--url <url>`        | _(required)_ | Target URL (http/https)                |
| `--out <file>`       | _(single)_   | Output path (.jpg, .jpeg, .png, .webp) |
| `--out-dir <dir>`    | _(batch)_    | Output directory for batch mode        |
| `--width <px>`       | `1440`       | Viewport width                         |
| `--max-height <px>`  | _none_       | Crop to this height if page is taller  |
| `--quality <1-100>`  | `82`         | JPEG/WebP quality                      |
| `--timeout <ms>`     | `30000`      | Page load timeout                      |
| `--wait <ms>`        | `500`        | Extra wait after load                  |
| `--no-pre-scroll`    |              | Skip pre-scroll stabilization          |
| `--viewports <list>` | `desktop`    | Comma-separated: desktop, mobile       |
| `--discover`         | `false`      | Discover rendered links from base page |
| `--max-pages <n>`    | `12`         | Max pages to capture                   |
| `--concurrency <n>`  | `2`          | Max concurrent captures                |

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

**Single mode:**

```
Success:  stdout = path  |  stderr = empty or MSHOT_LIMITED  |  exit 0
Failure:  stdout = (empty)  |  stderr = MSHOT_ERROR: ...  |  exit 1
```

**Batch mode:**

```
Success (≥1 page):  stdout = manifest.json path  |  exit 0
Failure (0 pages):  stdout = (empty)  |  stderr = MSHOT_ERROR: ...  |  exit 1
Warning:            MSHOT_WARN: skipped pages
```

### Examples

```bash
mshot --url https://example.com --out example.jpg
mshot --url https://example.com --out example.webp --quality 50
mshot --url https://example.com --out example.jpg --max-height 20000
mshot --url https://example.com --out example.jpg --no-pre-scroll
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --discover --max-pages 12
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --viewports desktop,mobile --max-height 900
```

### Batch: manifest.json

Batch mode writes a `manifest.json` to `--out-dir`:

- `pages[]` — captured pages with screenshot paths
- `skipped[]` — failed pages with reason
- `viewports[]` — viewport definitions
- First page is always the base URL (source: `base`)
- Discovered links have source: `rendered-link`
- Same-origin only, no assets/mailto/tel/hash links

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
