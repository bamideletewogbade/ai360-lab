import { browserPilotConfiguration, canUseBrowserPilot } from '@/lib/browser/config'
import { browserSessionProvider } from '@/lib/browser/browserbase'
import { BrowserProviderError } from '@/lib/browser/provider'
import { loadBrowserSession, setBrowserSessionStatus } from '@/lib/browser/store'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeId(value: string) {
  return /^browser_[A-Za-z0-9-]{20,80}$/.test(value) ? value : null
}

async function ownedSession(request: Request, sessionId: string) {
  const requester = await resolveRequester(request)
  if (!canUseBrowserPilot(requester.context)) return { requester, session: null }
  const id = safeId(sessionId)
  const session = id ? await loadBrowserSession(requester.context!.workspace.key, id) : null
  return { requester, session }
}

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const log = requestLogger(request, '/api/browser/sessions/[sessionId]')
  const { sessionId } = await params
  if (!browserPilotConfiguration().ready) return Response.json({ error: 'Browser work is not available yet.' }, { status: 503, headers: log.headers() })
  const owned = await ownedSession(request, sessionId)
  const limited = rateLimit(request, 'browser', { minute: 20, daily: 240 }, owned.requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  if (!owned.session) return Response.json({ error: 'That browser session is not available.' }, { status: 404, headers: log.headers() })

  try {
    const provider = browserSessionProvider()
    const remote = await provider.getSession(owned.session.providerSessionId)
    if (remote.status !== owned.session.status) {
      await setBrowserSessionStatus(owned.session.workspaceKey, owned.session.id, remote.status)
    }
    const liveView = remote.status === 'running'
      ? await provider.getReadOnlyLiveView(owned.session.providerSessionId)
      : null
    log.finish(200, { outcome: 'browser_session_loaded', status: remote.status })
    return Response.json({
      sessionId: owned.session.id,
      runId: owned.session.runId,
      status: remote.status,
      expiresAt: remote.expiresAt,
      mode: 'read_only',
      liveView,
    }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('browser.session_lookup_failed', errorDetails(error))
    const status = error instanceof BrowserProviderError && error.code === 'not_configured' ? 503 : 502
    return Response.json({ error: 'The browser session could not be checked.' }, { status, headers: log.headers() })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const log = requestLogger(request, '/api/browser/sessions/[sessionId]')
  const { sessionId } = await params
  const owned = await ownedSession(request, sessionId)
  const limited = rateLimit(request, 'browser', { minute: 6, daily: 30 }, owned.requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  if (!owned.session) return Response.json({ error: 'That browser session is not available.' }, { status: 404, headers: log.headers() })

  try {
    await browserSessionProvider().closeSession(owned.session.providerSessionId)
    await setBrowserSessionStatus(owned.session.workspaceKey, owned.session.id, 'closed')
    log.finish(200, { outcome: 'browser_session_closed' })
    return Response.json({ sessionId: owned.session.id, status: 'closed' }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('browser.session_close_failed', errorDetails(error))
    return Response.json({ error: 'The browser session could not be closed.' }, { status: 502, headers: log.headers() })
  }
}
