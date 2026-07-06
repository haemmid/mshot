// lib/discovery.js — rendered same-origin link discovery
// Receives an existing Playwright page. Does NOT launch/close browser.

const ASSET_EXTS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.wav',
  '.ico',
  '.css',
  '.js',
  '.map',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.json',
  '.xml',
  '.csv',
  '.exe',
  '.dmg',
  '.apk',
  '.deb',
  '.rpm'
]

const SKIPPED_PROTOCOLS = new Set(['mailto:', 'tel:', 'javascript:', 'data:'])

// Parse a single href, return normalized URL string or null
function parseLink(href, origin) {
  try {
    const parsed = new URL(href)

    if (parsed.origin !== origin) return null
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (SKIPPED_PROTOCOLS.has(href.split(':')[0] + ':')) return null
    if (href.startsWith('#')) return null

    const pathPart = parsed.pathname.split('?')[0].split('#')[0]
    if (ASSET_EXTS.some(ext => pathPart.endsWith(ext))) return null

    return parsed.origin + parsed.pathname + parsed.search
  } catch {
    return null
  }
}

// Discover same-origin rendered links from an existing page
// Returns deduplicated array of URL strings
export async function discoverLinks(
  page,
  baseUrl,
  timeout,
  networkidleTimeout
) {
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout })
    try {
      await page.waitForLoadState('networkidle', {
        timeout: networkidleTimeout ?? 10_000
      })
    } catch {
      // proceed
    }
  } catch {
    return []
  }

  // Pre-scroll to reveal lazy-loaded links
  const scrollHeight = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  )
  if (scrollHeight > 0) {
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    )
    await new Promise(r => setTimeout(r, 300))
    await page.evaluate(() => window.scrollTo(0, 0))
    await new Promise(r => setTimeout(r, 300))
  }

  const origin = new URL(baseUrl).origin
  const rawLinks = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href]')]
    return anchors.map(a => a.href)
  })

  const links = new Set()
  for (const href of rawLinks) {
    const parsed = parseLink(href, origin)
    if (parsed) links.add(parsed)
  }

  return [...links]
}
