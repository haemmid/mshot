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

#### Explicit URL list (`--urls-file`)

For deterministic capture of specific routes (e.g. important app screens),
use `--urls-file` with a plain text file — one URL or path per line:

```bash
mshot batch --url http://localhost:4321 --out-dir tmp/visual-capture --urls-file .mshot/visual-routes.txt
mshot batch --url http://localhost:4321 --out-dir tmp/visual-capture --urls-file .mshot/visual-routes.txt --discover --max-pages 12
```

File format (plain text, one entry per line):

```
/
# important app screens
/projects
/project/demo/errors
http://localhost:4321/settings
```

Rules:

- Empty lines and lines starting with `#` are ignored
- Leading/trailing whitespace is trimmed
- Relative paths (starting with `/`) are resolved against `--url`
- Absolute URLs are allowed only if same-origin as `--url`
- Hash fragments are stripped
- Exact duplicates are removed
- External origins are skipped (recorded in `manifest.json` `skipped[]`)

With `--urls-file`:

- Explicit input URLs are captured first, before any discovered URLs
- Explicit input URLs are **not** removed by route pattern deduplication
- If `--discover` is also used, discovered URLs fill remaining `--max-pages` slots
- If `--urls-file` is not specified, behavior is unchanged (base URL + optional discover)

### Options

| Flag                         | Default      | Description                                               |
| ---------------------------- | ------------ | --------------------------------------------------------- |
| `--url <url>`                | _(required)_ | Target URL (http/https)                                   |
| `--out <file>`               | _(single)_   | Output path (.jpg, .jpeg, .png, .webp)                    |
| `--out-dir <dir>`            | _(batch)_    | Output directory for batch mode                           |
| `--width <px>`               | `1440`       | Viewport width                                            |
| `--max-height <px>`          | _none_       | Crop to this height if page is taller                     |
| `--quality <1-100>`          | `82`         | JPEG/WebP quality                                         |
| `--timeout <ms>`             | `30000`      | Page load timeout                                         |
| `--wait <ms>`                | `500`        | Extra wait after load                                     |
| `--no-pre-scroll`            |              | Skip pre-scroll stabilization                             |
| `--no-settle`                |              | Skip font/image settle and animation normalization        |
| `--settle-timeout <ms>`      | `3000`       | Settle timeout ceiling (not a fixed sleep)                |
| `--viewports <list>`         | `desktop`    | Comma-separated: desktop, mobile                          |
| `--discover`                 | `false`      | Discover rendered links from base page                    |
| `--max-pages <n>`            | `12`         | Max pages to capture                                      |
| `--concurrency <n>`          | `2`          | Max concurrent captures                                   |
| `--networkidle-timeout <ms>` | `2000`       | `networkidle` wait timeout per page (batch)               |
| `--max-per-pattern <n>`      | `1`          | Max URLs per route pattern (dedupe)                       |
| `--no-route-dedupe`          |              | Disable route pattern deduplication                       |
| `--depth <n>`                | `1`          | Link discovery depth: 1 = base only, 2 = one level deeper |
| `--urls-file <file>`         |              | Explicit URL/path list (plain text, one per line)         |

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
mshot --url https://example.com --out example.jpg --no-settle
mshot --url https://example.com --out example.jpg --settle-timeout 1000
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --discover --max-pages 12
mshot batch --url http://localhost:3079 --out-dir tmp/visual-capture --viewports desktop,mobile --max-height 900
mshot batch --url http://localhost:4321 --out-dir tmp/visual-capture --urls-file .mshot/visual-routes.txt
mshot batch --url http://localhost:4321 --out-dir tmp/visual-capture --urls-file .mshot/visual-routes.txt --no-settle
```

### Batch: manifest.json

Batch mode writes a `manifest.json` to `--out-dir`:

```jsonc
{
  "manifestVersion": 1,
  "baseUrl": "http://localhost:3079",
  "createdAt": "2026-07-06T...",
  "viewports": { "desktop": { "width": 1440 }, "mobile": { "width": 390 } },
  "pages": [
    {
      "url": "http://localhost:3079",
      "source": "base",
      "screenshots": { "desktop": "home-desktop.jpg" },
      "timings": {
        "gotoMs": 120,
        "networkidleMs": 80,
        "preScrollMs": 3500,
        "fontWaitMs": 15,
        "imageWaitMs": 50,
        "screenshotMs": 200,
        "totalMs": 4000
      }
    }
  ],
  "skipped": [
    {
      "url": "http://localhost:3079/project/abc123",
      "source": "rendered-link",
      "reason": "duplicate-pattern",
      "pattern": "/project/:id"
    }
  ]
}
```

- `pages[]` — captured pages with screenshot paths and timings
- `skipped[]` — failed pages, deduplicated duplicates, or overflow from `--max-pages`
- `viewports[]` — viewport definitions
- First page is always the base URL (source: `base`)
- Discovered links have source: `rendered-link`
- Explicit input URLs (from `--urls-file`) have source: `input`
- Same-origin only, no assets/mailto/tel/hash links

#### Timings

Each page record includes timing breakdown:

- `gotoMs` — navigation time
- `networkidleMs` — `networkidle` wait time
- `preScrollMs` — pre-scroll time (if enabled)
- `fontWaitMs` — font settle time (if settle enabled)
- `imageWaitMs` — image settle time (if settle enabled)
- `screenshotMs` — screenshot capture time
- `totalMs` — total capture time

#### Route pattern deduplication

By default, `--discover` captures at most **1 URL per route pattern**.
This prevents capturing dozens of entity-instance pages that look the same visually.

Pattern heuristic: numeric/UUID/long/encoded segments → `:id`

- `/project/foo` → `/project/:id`
- `/project/bar` → `/project/:id`
- `/project/foo/errors` → `/project/:id/errors`

Duplicates are recorded in `manifest.json` under `skipped[]` with `reason: "duplicate-pattern"`.

#### Depth

- `--depth 1` (default): base page + links from base page
- `--depth 2`: after dedupe, open selected representative pages and discover their links too

#### Example

```bash
mshot batch \
  --url http://localhost:3079 \
  --out-dir tmp/visual-capture \
  --discover \
  --depth 2 \
  --max-pages 8 \
  --max-per-pattern 1 \
  --viewports desktop \
  --networkidle-timeout 2000 \
  --max-height 20000
```

## How it works

1. Fresh Chromium (headless)
2. Navigate → wait `domcontentloaded` → `networkidle`
3. **Pre-scroll** top→bottom→top (reveals lazy images, IntersectionObserver content)
4. **Settle** — best-effort wait for `document.fonts.ready` and `<img>` load (ceiling: `--settle-timeout`)
5. Optional `--wait <ms>` extra pause
6. Full-page screenshot with `animations: 'disabled'`
7. Atomic write (tmp → rename)

## Design

- **Stable over clever** — predictable behavior > smart behavior
- **Agent-safe** — clean stdout/stderr, atomic writes, no stale files
- **No DOM parsing, no AI, no analysis** — just screenshot and save
- **One browser per batch** — discovery reuses the batch browser
- **Route pattern dedup** — avoids capturing 50 identical entity pages
- **Batch captures pages and writes manifest. It does not analyze screenshots or call models.**

## License

MIT
