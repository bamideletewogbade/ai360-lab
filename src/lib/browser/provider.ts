export type BrowserProviderStatus = 'starting' | 'ready' | 'running' | 'closed' | 'expired' | 'failed'

export type BrowserSession = {
  provider: string
  providerSessionId: string
  status: BrowserProviderStatus
  expiresAt: string
}

export type BrowserLiveView = {
  url: string
  mode: 'read_only'
}

export type OpenBrowserSessionInput = {
  timeoutSeconds: number
  viewport: { width: number; height: number }
  metadata: Record<string, string>
}

export type PageObservation = {
  providerRequestId: string
  requestedUrl: string
  finalUrl: string
  statusCode: number
  contentType: string
  title: string
  text: string
  links: Array<{ label: string; url: string }>
  redirectLocation: string | null
  truncated: boolean
  warnings: Array<'possible_prompt_injection'>
  untrustedContent: true
}

export type ObservePageInput = {
  url: string
  maxCharacters: number
}

/**
 * Provider credentials and connection URLs remain behind this server-only
 * boundary. A client may receive a read-only live-view URL, never the CDP URL.
 */
export interface BrowserSessionProvider {
  readonly name: string
  openSession(input: OpenBrowserSessionInput): Promise<BrowserSession>
  getSession(providerSessionId: string): Promise<BrowserSession>
  getReadOnlyLiveView(providerSessionId: string): Promise<BrowserLiveView>
  closeSession(providerSessionId: string): Promise<void>
}

export interface PageObservationProvider {
  readonly name: string
  observePage(input: ObservePageInput): Promise<PageObservation>
}

export type VisualObservationResult = {
  url: string
  title: string
  text: string
  links: Array<{ label: string; url: string }>
  truncated: boolean
  warnings: string[]
  screenshot: { mimeType: 'image/jpeg'; bytesBase64: string; sha256: string; byteLength: number }
}

export type BrowserInvocation = {
  invocationId: string
  providerSessionId: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  result: VisualObservationResult | null
  error: string | null
}

export interface VisualNavigationProvider {
  readonly name: string
  invoke(input: { url: string; allowedDomains: string[] }): Promise<BrowserInvocation>
  poll(invocationId: string): Promise<BrowserInvocation>
}

export class BrowserProviderError extends Error {
  readonly code: 'not_configured' | 'provider_rejected' | 'provider_unavailable' | 'invalid_response'
  readonly status?: number

  constructor(
    code: 'not_configured' | 'provider_rejected' | 'provider_unavailable' | 'invalid_response',
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'BrowserProviderError'
    this.code = code
    this.status = status
  }
}
