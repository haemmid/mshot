#!/usr/bin/env node
// mshot — simple, stable full-page screenshot CLI
// Usage: mshot --url <url> --out <file> [--width 1440] [--quality 82] [--timeout 30000] [--max-height 20000]
// stdout: path to saved file
// stderr: diagnostics
// exit 0 on success, non-zero on failure

import { resolve, dirname, extname } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createWriteStream, statSync } from "node:fs";

// ── Defaults ──────────────────────────────────────────────
const DEFAULTS = {
  width: 1440,
  quality: 82,
  timeout: 30_000,
  maxHeights: null, // no limit by default
};

// ── Parse args ────────────────────────────────────────────
const { values, positionals } = parseArgs({
  options: {
    url:        { type: "string" },
    out:        { type: "string" },
    width:      { type: "string",  default: String(DEFAULTS.width) },
    quality:    { type: "string",  default: String(DEFAULTS.quality) },
    timeout:    { type: "string",  default: String(DEFAULTS.timeout) },
    "max-height": { type: "string", default: null },
  },
  allowPositionals: false,
  strict: true,
});

if (!values.url) {
  console.error("error: --url is required");
  process.exitCode = 1;
  process.exit();
}
if (!values.out) {
  console.error("error: --out is required");
  process.exitCode = 1;
  process.exit();
}

const url = values.url;
const outFile = resolve(values.out);
const width = parseInt(values.width, 10);
const quality = parseInt(values.quality, 10);
const timeout = parseInt(values.timeout, 10);
const maxHeight = values["max-height"]
  ? parseInt(values["max-height"], 10)
  : null;

// ── Main ──────────────────────────────────────────────────
(async () => {
  let browser;
  try {
    // 1. Fresh browser + context
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    console.error(`mshot: navigating to ${url}`);

    // 2. Navigate + wait domcontentloaded
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });

    console.error("mshot: DOM loaded, waiting for networkidle…");

    // 3. Wait networkidle with a fallback timeout
    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch {
      console.error("mshot: networkidle timeout, proceeding anyway");
    }

    // 4. Check max-height
    let limited = false;
    if (maxHeight !== null) {
      const pageHeight = await page.evaluate(() =>
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        )
      );
      if (pageHeight > maxHeight) {
        limited = true;
        console.error(
          `MSHOT_LIMITED: page height ${pageHeight}px, capturing first ${maxHeight}px`
        );
        // Crop viewport to max height
        await context.updateViewport({ width, height: maxHeight });
      }
    }

    // 5. Full-page screenshot
    console.error("mshot: capturing full-page screenshot…");

    const buffer = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality,
    });

    // 6. Write file
    const stream = createWriteStream(outFile);
    stream.write(buffer);
    stream.end();

    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    const size = statSync(outFile).size;
    console.error(
      `mshot: saved ${outFile} (${(size / 1024).toFixed(1)} KB)`
    );
    if (limited) {
      console.error("mshot: WARNING — page was taller than --max-height");
    }

    // 7. stdout = path to file
    process.stdout.write(outFile + "\n");
  } catch (err) {
    console.error(`mshot: error — ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
