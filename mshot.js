#!/usr/bin/env node
// mshot — simple, stable full-page screenshot CLI
// Usage: mshot --url <url> --out <file> [--width 1440] [--quality 82] [--timeout 30000] [--max-height 20000]
// stdout: path to saved file
// stderr: diagnostics
// exit 0 on success, non-zero on failure

import { resolve, extname } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createWriteStream, statSync } from "node:fs";
import sharp from "sharp";

// ── Parse args ────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    url:          { type: "string" },
    out:          { type: "string" },
    width:        { type: "string",  default: "1440" },
    quality:      { type: "string",  default: "82" },
    timeout:      { type: "string",  default: "30000" },
    "max-height": { type: "string" },
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
  : undefined;

// Determine output format from extension
const ext = extname(outFile).toLowerCase();
const format = ext === ".webp" ? "webp" : "jpeg";

// ── Main ──────────────────────────────────────────────────
(async () => {
  let browser;
  try {
    // 1. Fresh browser + context
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
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

    // 4. Full-page screenshot
    console.error("mshot: capturing full-page screenshot…");
    let buffer = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality,
    });

    // 5. Check max-height — crop if needed
    let limited = false;
    if (maxHeight !== undefined) {
      const pageHeight = await page.evaluate(() =>
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        )
      );
      if (pageHeight > maxHeight) {
        limited = true;
        console.error(
          `MSHOT_LIMITED: page height ${pageHeight}px, ` +
          `captured first ${maxHeight}px`
        );
        // Crop to maxHeight (cut bottom, don't scale)
        const { width: w, height: h } = await sharp(buffer).metadata();
        buffer = await sharp(buffer)
          .extract({ left: 0, top: 0, width: w, height: Math.min(h, maxHeight) })
          .toBuffer();
      }
    }

    // 6. Convert to output format if needed
    if (format === "webp") {
      buffer = await sharp(buffer).webp({ quality }).toBuffer();
    } else {
      // jpeg
      buffer = await sharp(buffer).jpeg({ quality }).toBuffer();
    }

    // 7. Write file
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

    // 8. stdout = path to file
    process.stdout.write(outFile + "\n");
  } catch (err) {
    console.error(`mshot: error — ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
