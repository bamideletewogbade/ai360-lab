import { z } from 'zod'
import { browserAllowedDomains, browserPilotConfiguration, canUseBrowserPilot, READ_ONLY_BROWSER_LIMITS } from '@/lib/browser/config'
import { browserSessionProvider } from '@/lib/browser/browserbase'
import { BrowserProviderError } from '@/lib/browser/provider'
import { createBrowserSessionRecord } from '@/lib/browser/store'
import { safePublicUrl } from '@/lib/agent/action-policy'
import { loadRun } from '@/lib/agent/store'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  runId: z.string().trim().min(5).max(64),
  url: z.string().trim().max(4_000),
})

function providerStatus(error: unknown) {
  if (!(error instanceof BrowserProviderError)) return 502
  if (error.code === 'not_configured') return 503
  if (error.code === 'provider_rejected' && error.status === 429) return 429
  return 502
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/browser/sessions')
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'browser', { minute: 2, daily: 12 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })

  const configuration = browserPilotConfiguration()
  if (!configuration.ready) {
    log.finish(503, { outcome: 'pilot_not_ready' })
    return Response.json({ error: 'Browser work is not available yet.' }, { status: 503, headers: log.headers() })
  }
  if (!canUseBrowserPilot(requester.context)) {
    log.finish(requester.context ? 403 : 401, { outcome: 'pilot_access_denied' })
    return Response.json({ error: requester.context ? 'This pilot is not enabled for your account.' : 'Sign in to use browser work.' }, {
      status: requester.context ? 403 : 401,
      headers: log.headers(),
    })
  }

  let body: unknown
  try { body = await request.json() } catch { body = null }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    log.finish(400, { outcome: 'invalid_request' })
    return Response.json({ error: 'Choose a valid run and web address.' }, { status: 400, headers: log.headers() })
  }

  const domains = browserAllowedDomains()
  const destination = safePublicUrl(parsed.data.url, domains)
  if (!destination) {
    log.finish(400, { outcome: 'domain_not_allowed' })
    return Response.json({ error: 'That website is outside this pilot.' }, { status: 400, headers: log.headers() })
  }

  const context = requester.context!
  const run = await loadRun(context.workspace.key, parsed.data.runId)
  if (!run) {
    log.finish(404, { outcome: 'run_not_found' })
    return Response.json({ error: 'That run is not in this workspace.' }, { status: 404, headers: log.headers() })
  }

  const provider = browserSessionProvider()
  let remote: Awaited<ReturnType<typeof provider.openSession>> | null = null
  try {
    remote = await provider.openSession({
      timeoutSeconds: READ_ONLY_BROWSER_LIMITS.maxDurationSeconds,
      viewport: READ_ONLY_BROWSER_LIMITS.viewport,
      metadata: {
        ai360RunId: run.runId.slice(0, 120),
        ai360Workspace: context.workspace.key.slice(0, 120),
        pilot: 'read_only',
      },
    })
    const sessionId = `browser_${crypto.randomUUID()}`
    try {
      await createBrowserSessionRecord({
        id: sessionId,
        workspaceKey: context.workspace.key,
        runId: run.runId,
        provider: remote.provider,
        providerSessionId: remote.providerSessionId,
        status: remote.status,
        allowedDomains: domains,
        lastUrl: destination.toString(),
        expiresAt: remote.expiresAt,
      })
    } catch (error) {
      await provider.closeSession(remote.providerSessionId).catch(() => undefined)
      throw error
    }
    log.finish(201, { outcome: 'browser_session_created', runId: run.runId, provider: remote.provider })
    return Response.json({
      sessionId,
      runId: run.runId,
      status: remote.status,
      expiresAt: remote.expiresAt,
      mode: 'read_only',
      destination: destination.toString(),
      limits: READ_ONLY_BROWSER_LIMITS,
    }, { status: 201, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('browser.session_create_failed', errorDetails(error))
    const status = providerStatus(error)
    log.finish(status, { outcome: 'browser_session_failed' })
    return Response.json({ error: 'A private browser session could not be started.' }, {
      status,
      headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }
}
