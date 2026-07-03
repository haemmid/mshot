// Postinstall: ensure playwright browsers are installed
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const pwDir = join(__dirname, 'node_modules', 'playwright')

if (existsSync(pwDir)) {
  try {
    execSync('npx playwright install --with-deps', {
      cwd: __dirname,
      stdio: 'inherit'
    })
  } catch {
    // non-fatal: user can run manually
    console.warn(
      "[mshot] Playwright browsers install failed — run 'npx playwright install' manually"
    )
  }
}
