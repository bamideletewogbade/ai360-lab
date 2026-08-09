import { createHash } from 'node:crypto'
import { defineFn } from '@browserbasehq/sdk-functions'
import { chromium } from 'playwright-core'
import { z } from 'zod'

const MAX_TEXT = 30_000
const MAX_LINKS = 40
const CONSEQUENCE = /\b(submit|send|publish|pay|purchase|book|confirm|delete|cancel|transfer|withdraw)\b/i
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i
const parametersSchema = z.object({
  url: z.string().trim().max(4_000),
  allowedDomains: z.array(z.string().trim().max(255)).max(20),
})
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

function failure(error: string): JsonObject {
  return { success: false, error }
}

function allowedUrl(value: string, domains: string[]) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname)) return null
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    const allowed = domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    return allowed ? url : null
  } catch { return null }
}

defineFn<typeof parametersSchema>('ai360-read-only-observe', async (ctx, params): Promise<JsonObject> => {
  const domains = Array.isArray(params.allowedDomains)
    ? [...new Set(params.allowedDomains.filter((item): item is string => typeof item === 'string')
      .map((item) => item.toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
      .filter((item) => /^[a-z0-9.-]+$/.test(item) && item.includes('.')))].slice(0, 20)
    : []
  const requested = typeof params.url === 'string' ? allowedUrl(params.url, domains) : null
  if (!requested || !domains.length) return failure('destination_not_allowed')

  const browser = await chromium.connectOverCDP(ctx.session.connectUrl)
  const context = browser.contexts()[0]
  const page = context?.pages()[0]
  if (!context || !page) return failure('browser_not_ready')

  await context.route('**/*', async (route) => {
    const request = route.request()
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient')
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      if (!allowedUrl(request.url(), domains)) return route.abort('blockedbyclient')
    }
    return route.continue()
  })

  try {
    await page.goto(requested.href, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const finalUrl = allowedUrl(page.url(), domains)
    if (!finalUrl) return failure('redirect_blocked')

    const observed = await page.evaluate(({ maxText, maxLinks }) => {
      const root = document.body?.cloneNode(true) as HTMLElement | undefined
      root?.querySelectorAll('script,style,noscript,template,svg,canvas').forEach((node) => node.remove())
      const text = (root?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .slice(0, maxLinks * 3)
        .map((link) => ({ label: (link.innerText.trim() || link.hostname).slice(0, 200), url: link.href.slice(0, 4_000) }))
        .filter((link, index, all) => /^https?:/.test(link.url) && all.findIndex((item) => item.url === link.url) === index)
        .slice(0, maxLinks)
      const controls = Array.from(document.querySelectorAll<HTMLElement>('button,input[type=submit],input[type=button],[role=button]'))
        .map((element) => (element.innerText || element.getAttribute('aria-label') || (element as HTMLInputElement).value || '').trim())
        .filter(Boolean)
        .slice(0, 80)
      return { title: document.title.slice(0, 300), text: text.slice(0, maxText), truncated: text.length > maxText, links, controls }
    }, { maxText: MAX_TEXT, maxLinks: MAX_LINKS })
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false })
    const warnings = observed.controls.some((label) => CONSEQUENCE.test(label)) ? ['consequential_controls_present'] : []
    return {
      success: true,
      data: {
        url: finalUrl.href,
        title: observed.title,
        text: observed.text,
        links: observed.links,
        truncated: observed.truncated,
        warnings,
        screenshot: {
          mimeType: 'image/jpeg',
          bytesBase64: screenshot.toString('base64'),
          sha256: createHash('sha256').update(screenshot).digest('hex'),
          byteLength: screenshot.byteLength,
        },
      },
    }
  } catch {
    return failure('navigation_failed')
  } finally {
    await browser.close().catch(() => undefined)
  }
}, {
  sessionConfig: {
    timeout: 300,
    keepAlive: false,
    region: 'us-west-2',
    browserSettings: {
      viewport: { width: 1280, height: 800 },
      solveCaptchas: false,
    },
  },
  parametersSchema,
})
