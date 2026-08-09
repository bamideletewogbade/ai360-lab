import { createHash } from 'node:crypto'
import { z } from 'zod'
import { actionPayloadHash, evaluateActionPolicy, safePublicUrl } from '@/lib/agent/action-policy'
import { normalizedActionSchema } from '@/lib/agent/tool-contracts'
import { loadRun } from '@/lib/agent/store'
import { browserAllowedDomains, browserNavigationConfiguration, canUseBrowserPilot } from '@/lib/browser/config'
import { visualNavigationProvider } from '@/lib/browser/browserbase'
import { BrowserProviderError } from '@/lib/browser/provider'
import { appendBrowserRunEvent, createBrowserAction, failBrowserAction, setBrowserActionInvocation } from '@/lib/browser/store'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  runId: z.string().trim().min(5).max(64),
  url: z.string().trim().max(4_000),
  requestKey: z.string().trim().min(8).max(120).optional(),
})

function stableId(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function errorStatus(error: unknown) {
  if (!(error instanceof BrowserProviderError)) return 502
  if (error.code === 'not_configured') return 503
  if (error.code === 'provider_rejected' && error.status === 429) return 429
  return 502
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/browser/navigate')
  const tooLarge = rejectLargeRequest(request, 12_000)
  if (tooLarge) return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'browser', { minute: 2, daily: 12 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })

  if (!browserNavigationConfiguration().ready) {
    log.finish(503, { outcome: 'visual_worker_not_ready' })
    return Response.json({ error: 'Visual browser work is not available yet.' }, { status: 503, headers: log.headers() })
  }
  if (!canUseBrowserPilot(requester.context)) {
    const status = requester.context ? 403 : 401
    log.finish(status, { outcome: 'pilot_access_denied' })
    return Response.json({ error: requester.context ? 'This pilot is not enabled for your account.' : 'Sign in to use browser work.' }, {
      status,
      headers: log.headers(),
    })
  }

  let body: unknown
  try { body = await request.json() } catch { body = null }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Choose a valid run and web address.' }, { status: 400, headers: log.headers() })

  const domains = browserAllowedDomains()
  const destination = safePublicUrl(parsed.data.url, domains)
  if (!destination) return Response.json({ error: 'That website is outside this pilot.' }, { status: 400, headers: log.headers() })
  const context = requester.context!
  const run = await loadRun(context.workspace.key, parsed.data.runId)
  if (!run) return Response.json({ error: 'That run is not in this workspace.' }, { status: 404, headers: log.headers() })

  const identity = stableId(`${context.workspace.key}:${run.runId}:${parsed.data.requestKey || log.requestId}:${destination.href}`)
  const action = normalizedActionSchema.parse({
    id: `action_${identity.slice(0, 40)}`,
    kind: 'navigate',
    capability: 'browser.navigate',
    effect: 'navigation',
    dataClass: 'public',
    url: destination.href,
    input: { url: destination.href },
    expectedOutcome: 'The approved public page is rendered and captured without changing the website.',
    idempotencyKey: `browser-navigate:${identity}`,
  })
  const policy = evaluateActionPolicy({
    action,
    workspaceKey: context.workspace.key,
    runId: run.runId,
    pilotMode: 'read_only',
    allowedDomains: domains,
    userAuthorizedTask: true,
  })
  if (policy.decision !== 'allow') return Response.json({ error: 'That page cannot be opened in this pilot.' }, { status: 400, headers: log.headers() })

  let actionId = action.id
  try {
    const stored = await createBrowserAction({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      action,
      risk: policy.risk,
      payloadHash: actionPayloadHash(action),
    })
    actionId = stored.id
    if (!stored.created) {
      log.finish(202, { outcome: 'existing_navigation', actionId })
      return Response.json({ actionId, status: 'working', pollUrl: `/api/browser/navigate/${actionId}` }, {
        status: 202,
        headers: log.headers({ 'Cache-Control': 'no-store' }),
      })
    }
    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      type: 'browser.navigation_queued',
      summary: `Preparing ${destination.hostname}`,
      payload: { actionId, url: destination.href },
    })

    const invocation = await visualNavigationProvider().invoke({ url: destination.href, allowedDomains: domains })
    if (invocation.status === 'failed') throw new BrowserProviderError('provider_rejected', 'The visual worker failed to start.')
    await setBrowserActionInvocation({
      workspaceKey: context.workspace.key,
      actionId,
      invocationId: invocation.invocationId,
      providerSessionId: invocation.providerSessionId,
      status: invocation.status === 'queued' ? 'queued' : 'running',
    })
    log.finish(202, { outcome: 'navigation_accepted', actionId })
    return Response.json({ actionId, status: 'working', pollUrl: `/api/browser/navigate/${actionId}` }, {
      status: 202,
      headers: log.headers({ 'Cache-Control': 'no-store', 'Retry-After': '2' }),
    })
  } catch (error) {
    await failBrowserAction({ workspaceKey: context.workspace.key, actionId, errorCode: 'worker_start_failed' }).catch(() => undefined)
    log.error('browser.navigation_start_failed', errorDetails(error))
    const status = errorStatus(error)
    log.finish(status, { outcome: 'navigation_start_failed', actionId })
    return Response.json({ error: 'The visual browser worker could not start.', actionId }, {
      status,
      headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }
}
