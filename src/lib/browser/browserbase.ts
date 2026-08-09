import { z } from 'zod'
import {
  BrowserProviderError,
  type BrowserLiveView, type BrowserProviderStatus, type BrowserSession,
  type BrowserSessionProvider, type OpenBrowserSessionInput,
  type ObservePageInput, type PageObservation, type PageObservationProvider,
  type BrowserInvocation, type VisualNavigationProvider,
} from '@/lib/browser/provider'

const API_ORIGIN = 'https://api.browserbase.com'
const providerSessionSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(['PENDING', 'RUNNING', 'ERROR', 'TIMED_OUT', 'COMPLETED']),
  expiresAt: z.string().datetime(),
})
const debugSchema = z.object({
  debuggerFullscreenUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:'),
})
const fetchResponseSchema = z.object({
  id: z.string().min(1).max(200),
  statusCode: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.unknown()).default({}),
  content: z.string(),
  contentType: z.string().max(500).default('application/octet-stream'),
})
const invocationSchema = z.object({
  id: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).nullish(),
  status: z.string().min(1).max(80),
  results: z.unknown().optional(),
})
const visualResultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string().url(),
    title: z.string().max(300),
    text: z.string().max(30_000),
    links: z.array(z.object({ label: z.string().max(200), url: z.string().url().max(4_000) })).max(40),
    truncated: z.boolean(),
    warnings: z.array(z.string().max(120)).max(10),
    screenshot: z.object({
      mimeType: z.literal('image/jpeg'),
      bytesBase64: z.string().max(1_200_000),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      byteLength: z.number().int().positive().max(750_000),
    }),
  }),
})
const visualFailureSchema = z.object({
  success: z.literal(false),
  error: z.string().trim().min(1).max(500),
})

type Fetcher = typeof fetch

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}

function pageTitle(html: string) {
  const value = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 300)
}

function pageText(content: string, contentType: string, maxCharacters: number) {
  if (!/html|xml/i.test(contentType)) {
    const clean = content.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim()
    return { text: clean.slice(0, maxCharacters), truncated: clean.length > maxCharacters }
  }
  const withoutActiveContent = content
    .replace(/<(script|style|noscript|template|svg|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
  const clean = decodeEntities(withoutActiveContent
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text: clean.slice(0, maxCharacters), truncated: clean.length > maxCharacters }
}

function pageLinks(html: string, baseUrl: string) {
  const links: Array<{ label: string; url: string }> = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(match[1]), baseUrl)
      if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) continue
      seen.add(url.href)
      const label = decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
      links.push({ label: (label || url.hostname).slice(0, 200), url: url.href.slice(0, 4_000) })
      if (links.length >= 40) break
    } catch { /* malformed page link */ }
  }
  return links
}

function headerValue(headers: Record<string, unknown>, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return typeof entry?.[1] === 'string' ? entry[1] : null
}

function observationWarnings(text: string): PageObservation['warnings'] {
  return /(?:ignore|disregard)[\s\S]{0,80}(?:previous|system|developer)[\s\S]{0,80}(?:instruction|prompt)|\bsystem message\b|\btool call\b/i.test(text)
    ? ['possible_prompt_injection']
    : []
}

function mappedStatus(value: z.infer<typeof providerSessionSchema>['status']): BrowserProviderStatus {
  if (value === 'PENDING') return 'starting'
  if (value === 'RUNNING') return 'running'
  if (value === 'COMPLETED') return 'closed'
  if (value === 'TIMED_OUT') return 'expired'
  return 'failed'
}

function invocationStatus(value: string): BrowserInvocation['status'] {
  const normalized = value.toUpperCase()
  if (normalized === 'COMPLETED') return 'completed'
  if (['FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(normalized)) return 'failed'
  if (['RUNNING', 'IN_PROGRESS'].includes(normalized)) return 'running'
  return 'queued'
}

export class BrowserbaseSessionProvider implements BrowserSessionProvider {
  readonly name = 'browserbase'
  private readonly apiKey: string
  private readonly projectId: string
  private readonly request: Fetcher

  constructor(
    apiKey = process.env.BROWSERBASE_API_KEY || '',
    projectId = process.env.BROWSERBASE_PROJECT_ID || '',
    request: Fetcher = fetch,
  ) {
    this.apiKey = apiKey
    this.projectId = projectId
    this.request = request
  }

  private async call(path: string, init: RequestInit = {}) {
    if (!this.apiKey || !this.projectId) {
      throw new BrowserProviderError('not_configured', 'The isolated browser provider is not configured.')
    }
    let response: Response
    try {
      response = await this.request(`${API_ORIGIN}${path}`, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: {
          'Content-Type': 'application/json',
          'X-BB-API-Key': this.apiKey,
          ...init.headers,
        },
      })
    } catch {
      throw new BrowserProviderError('provider_unavailable', 'The isolated browser provider could not be reached.')
    }
    if (!response.ok) {
      throw new BrowserProviderError('provider_rejected', 'The isolated browser provider rejected the request.', response.status)
    }
    return response
  }

  private session(value: unknown): BrowserSession {
    const parsed = providerSessionSchema.safeParse(value)
    if (!parsed.success) throw new BrowserProviderError('invalid_response', 'The browser provider returned an invalid session.')
    return {
      provider: this.name,
      providerSessionId: parsed.data.id,
      status: mappedStatus(parsed.data.status),
      expiresAt: parsed.data.expiresAt,
    }
  }

  async openSession(input: OpenBrowserSessionInput) {
    const response = await this.call('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        projectId: this.projectId,
        keepAlive: true,
        region: process.env.BROWSERBASE_REGION || 'eu-central-1',
        timeout: Math.min(300, Math.max(60, Math.floor(input.timeoutSeconds))),
        browserSettings: {
          viewport: input.viewport,
          solveCaptchas: false,
        },
        userMetadata: input.metadata,
      }),
    })
    return this.session(await response.json())
  }

  async getSession(providerSessionId: string) {
    const response = await this.call(`/v1/sessions/${encodeURIComponent(providerSessionId)}`)
    return this.session(await response.json())
  }

  async getReadOnlyLiveView(providerSessionId: string): Promise<BrowserLiveView> {
    const response = await this.call(`/v1/sessions/${encodeURIComponent(providerSessionId)}/debug`)
    const parsed = debugSchema.safeParse(await response.json())
    if (!parsed.success) throw new BrowserProviderError('invalid_response', 'The browser provider returned an invalid live view.')
    const live = new URL(parsed.data.debuggerFullscreenUrl)
    live.searchParams.set('navbar', 'false')
    return { url: live.toString(), mode: 'read_only' }
  }

  async closeSession(providerSessionId: string) {
    await this.call(`/v1/sessions/${encodeURIComponent(providerSessionId)}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'REQUEST_RELEASE', projectId: this.projectId }),
    })
  }
}

/**
 * Browserbase Fetch is the first capability in the ladder. It renders and
 * returns one public page without opening an interactive agent loop. Redirects
 * stay disabled so every destination is checked by AI360 before another fetch.
 */
export class BrowserbasePageObservationProvider implements PageObservationProvider {
  readonly name = 'browserbase_fetch'
  private readonly apiKey: string
  private readonly request: Fetcher

  constructor(apiKey = process.env.BROWSERBASE_API_KEY || '', request: Fetcher = fetch) {
    this.apiKey = apiKey
    this.request = request
  }

  async observePage(input: ObservePageInput): Promise<PageObservation> {
    if (!this.apiKey) throw new BrowserProviderError('not_configured', 'The page observation provider is not configured.')
    let response: Response
    try {
      response = await this.request(`${API_ORIGIN}/v1/fetch`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: { 'Content-Type': 'application/json', 'X-BB-API-Key': this.apiKey },
        body: JSON.stringify({
          url: input.url,
          allowRedirects: false,
          allowInsecureSsl: false,
          proxies: false,
        }),
      })
    } catch {
      throw new BrowserProviderError('provider_unavailable', 'The page observation provider could not be reached.')
    }
    if (!response.ok) {
      throw new BrowserProviderError('provider_rejected', 'The page observation provider rejected the request.', response.status)
    }
    const parsed = fetchResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new BrowserProviderError('invalid_response', 'The page observation provider returned invalid content.')

    const raw = parsed.data.content.slice(0, 1_000_000)
    const extracted = pageText(raw, parsed.data.contentType, Math.min(30_000, Math.max(1_000, input.maxCharacters)))
    const location = headerValue(parsed.data.headers, 'location')
    return {
      providerRequestId: parsed.data.id,
      requestedUrl: input.url,
      finalUrl: input.url,
      statusCode: parsed.data.statusCode,
      contentType: parsed.data.contentType,
      title: /html/i.test(parsed.data.contentType) ? pageTitle(raw) : '',
      text: extracted.text,
      links: /html/i.test(parsed.data.contentType) ? pageLinks(raw, input.url) : [],
      redirectLocation: location?.slice(0, 4_000) ?? null,
      truncated: parsed.data.content.length > raw.length || extracted.truncated,
      warnings: observationWarnings(extracted.text),
      untrustedContent: true,
    }
  }
}

export class BrowserbaseVisualNavigationProvider implements VisualNavigationProvider {
  readonly name = 'browserbase_function'
  private readonly apiKey: string
  private readonly functionId: string
  private readonly request: Fetcher

  constructor(
    apiKey = process.env.BROWSERBASE_API_KEY || '',
    functionId = process.env.BROWSERBASE_NAVIGATE_FUNCTION_ID || '',
    request: Fetcher = fetch,
  ) {
    this.apiKey = apiKey
    this.functionId = functionId
    this.request = request
  }

  private async call(path: string, init: RequestInit = {}) {
    if (!this.apiKey || !this.functionId) throw new BrowserProviderError('not_configured', 'The visual browser worker is not configured.')
    let response: Response
    try {
      response = await this.request(`${API_ORIGIN}${path}`, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: { 'Content-Type': 'application/json', 'X-BB-API-Key': this.apiKey, ...init.headers },
      })
    } catch {
      throw new BrowserProviderError('provider_unavailable', 'The visual browser worker could not be reached.')
    }
    if (!response.ok) throw new BrowserProviderError('provider_rejected', 'The visual browser worker rejected the request.', response.status)
    return response
  }

  private invocation(value: unknown): BrowserInvocation {
    const parsed = invocationSchema.safeParse(value)
    if (!parsed.success) throw new BrowserProviderError('invalid_response', 'The visual browser worker returned an invalid invocation.')
    const status = invocationStatus(parsed.data.status)
    const result = status === 'completed' ? visualResultSchema.safeParse(parsed.data.results) : null
    const failure = visualFailureSchema.safeParse(parsed.data.results)
    if (status === 'completed' && !result?.success) {
      if (failure.success) return {
        invocationId: parsed.data.id,
        providerSessionId: parsed.data.sessionId ?? null,
        status: 'failed',
        result: null,
        error: failure.data.error,
      }
      throw new BrowserProviderError('invalid_response', 'The visual browser worker returned an invalid result.')
    }
    return {
      invocationId: parsed.data.id,
      providerSessionId: parsed.data.sessionId ?? null,
      status,
      result: result?.success ? result.data.data : null,
      error: status === 'failed' ? 'worker_failed' : null,
    }
  }

  async invoke(input: { url: string; allowedDomains: string[] }) {
    const response = await this.call(`/v1/functions/${encodeURIComponent(this.functionId)}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ params: input }),
    })
    return this.invocation(await response.json())
  }

  async poll(invocationId: string) {
    const response = await this.call(`/v1/functions/invocations/${encodeURIComponent(invocationId)}`)
    return this.invocation(await response.json())
  }
}

export function browserSessionProvider(): BrowserSessionProvider {
  const provider = process.env.AI360_BROWSER_PROVIDER || 'browserbase'
  if (provider === 'browserbase') return new BrowserbaseSessionProvider()
  throw new BrowserProviderError('not_configured', 'The configured browser provider is not supported.')
}

export function pageObservationProvider(): PageObservationProvider {
  const provider = process.env.AI360_BROWSER_PROVIDER || 'browserbase'
  if (provider === 'browserbase') return new BrowserbasePageObservationProvider()
  throw new BrowserProviderError('not_configured', 'The configured page observation provider is not supported.')
}

export function visualNavigationProvider(): VisualNavigationProvider {
  const provider = process.env.AI360_BROWSER_PROVIDER || 'browserbase'
  if (provider === 'browserbase') return new BrowserbaseVisualNavigationProvider()
  throw new BrowserProviderError('not_configured', 'The configured visual browser provider is not supported.')
}
