import { createHash } from 'node:crypto'
import { z } from 'zod'
import { actionPayloadHash, evaluateActionPolicy, safePublicUrl } from '@/lib/agent/action-policy'
import { normalizedActionSchema } from '@/lib/agent/tool-contracts'
import { browserAllowedDomains, browserPilotConfiguration, canUseBrowserPilot } from '@/lib/browser/config'
import { pageObservationProvider } from '@/lib/browser/browserbase'
import { BrowserProviderError } from '@/lib/browser/provider'
import { appendBrowserRunEvent, completeBrowserAction, createBrowserAction, failBrowserAction } from '@/lib/browser/store'
import { loadRun } from '@/lib/agent/store'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  runId: z.string().trim().min(5).max(64),
  url: z.string().trim().max(4_000),
})

function stableId(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function providerStatus(error: unknown) {
  if (!(error instanceof BrowserProviderError)) return 502
  if (error.code === 'not_configured') return 503
  if (error.code === 'provider_rejected' && error.status === 429) return 429
  return 502
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/browser/observe')
  const tooLarge = rejectLargeRequest(request, 12_000)
  if (tooLarge) return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'browser', { minute: 2, daily: 12 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })

  if (!browserPilotConfiguration().ready) {
    log.finish(503, { outcome: 'pilot_not_ready' })
    return Response.json({ error: 'Browser work is not available yet.' }, { status: 503, headers: log.headers() })
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

  const identity = stableId(`${context.workspace.key}:${run.runId}:${log.requestId}:${destination.href}`)
  const action = normalizedActionSchema.parse({
    id: `action_${identity.slice(0, 40)}`,
    kind: 'observe_dom',
    capability: 'browser.observe',
    effect: 'passive',
    dataClass: 'public',
    url: destination.href,
    input: { url: destination.href },
    expectedOutcome: 'Public page content is returned without changing the website.',
    idempotencyKey: `browser-observe:${identity}`,
  })
  const policy = evaluateActionPolicy({
    action,
    workspaceKey: context.workspace.key,
    runId: run.runId,
    pilotMode: 'read_only',
    allowedDomains: domains,
    userAuthorizedTask: true,
  })
  if (policy.decision !== 'allow') {
    log.finish(400, { outcome: 'action_blocked', reasonCode: policy.reasonCode })
    return Response.json({ error: 'That page cannot be opened in this pilot.' }, { status: 400, headers: log.headers() })
  }

  const payloadHash = actionPayloadHash(action)
  let actionId = action.id
  try {
    const stored = await createBrowserAction({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      action,
      risk: policy.risk,
      payloadHash,
    })
    actionId = stored.id
    if (!stored.created) {
      log.finish(409, { outcome: 'duplicate_observation', actionId })
      return Response.json({ error: 'This observation request was already accepted.', actionId }, {
        status: 409,
        headers: log.headers({ 'Cache-Control': 'no-store' }),
      })
    }
    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      type: 'browser.observation_started',
      summary: `Opening ${destination.hostname}`,
      payload: { actionId, url: destination.href },
    }).catch(() => undefined)
  } catch (error) {
    log.error('browser.observation_persistence_failed', errorDetails(error))
    log.finish(503, { outcome: 'persistence_required' })
    return Response.json({ error: 'Browser work needs a healthy durable workspace.' }, { status: 503, headers: log.headers() })
  }

  try {
    const observation = await pageObservationProvider().observePage({ url: destination.href, maxCharacters: 30_000 })
    if (observation.redirectLocation) {
      const redirect = safePublicUrl(observation.redirectLocation, domains)
      await failBrowserAction({
        workspaceKey: context.workspace.key,
        actionId,
        errorCode: redirect ? 'redirect_requires_new_action' : 'redirect_blocked',
      })
      await appendBrowserRunEvent({
        workspaceKey: context.workspace.key,
        runId: run.runId,
        type: 'browser.redirect_blocked',
        summary: redirect ? 'A redirect needs review' : 'A redirect left the approved website scope',
        payload: { actionId, redirectAllowed: Boolean(redirect) },
      }).catch(() => undefined)
      log.finish(409, { outcome: redirect ? 'redirect_requires_new_action' : 'redirect_blocked', actionId })
      return Response.json({
        error: redirect ? 'This page redirects. Review the next address before continuing.' : 'This page redirects outside the pilot.',
        actionId,
        ...(redirect ? { redirect: redirect.href } : {}),
      }, { status: 409, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    const verified = observation.statusCode >= 200 && observation.statusCode < 300 && observation.text.length > 0
    const result = {
      providerRequestId: observation.providerRequestId,
      url: observation.finalUrl,
      statusCode: observation.statusCode,
      contentType: observation.contentType,
      title: observation.title,
      text: observation.text,
      links: observation.links,
      truncated: observation.truncated,
      warnings: observation.warnings,
      untrustedContent: true,
    }
    await completeBrowserAction({ workspaceKey: context.workspace.key, actionId, result, verified })
    if (!verified) {
      log.finish(422, { outcome: 'observation_not_verified', actionId, statusCode: observation.statusCode })
      return Response.json({ error: 'The page returned no usable public content.', actionId }, {
        status: 422,
        headers: log.headers({ 'Cache-Control': 'no-store' }),
      })
    }

    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      type: 'page.observed',
      summary: `Read ${observation.title || destination.hostname}`,
      payload: {
        actionId,
        url: destination.href,
        statusCode: observation.statusCode,
        characters: observation.text.length,
        warnings: observation.warnings,
      },
    }).catch(() => undefined)

    log.finish(200, { outcome: 'page_observed', actionId, characters: observation.text.length, linkCount: observation.links.length })
    return Response.json({ actionId, observation: result }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    await failBrowserAction({ workspaceKey: context.workspace.key, actionId, errorCode: 'provider_failed' }).catch(() => undefined)
    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: run.runId,
      type: 'browser.observation_failed',
      summary: `Could not read ${destination.hostname}`,
      visibility: 'operator',
      payload: { actionId },
    }).catch(() => undefined)
    log.error('browser.observation_failed', errorDetails(error))
    const status = providerStatus(error)
    log.finish(status, { outcome: 'observation_failed', actionId })
    return Response.json({ error: 'The public page could not be read.', actionId }, {
      status,
      headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }
}
