import { createHash } from 'node:crypto'
import { getOptionalAuthContext } from '@/lib/auth'
import { safePublicUrl } from '@/lib/agent/action-policy'
import { browserAllowedDomains, browserNavigationConfiguration, canUseBrowserPilot } from '@/lib/browser/config'
import { uploadBrowserScreenshot } from '@/lib/browser/artifact-storage'
import { visualNavigationProvider } from '@/lib/browser/browserbase'
import { BrowserProviderError } from '@/lib/browser/provider'
import {
  appendBrowserRunEvent, completeBrowserAction, failBrowserAction, loadBrowserAction,
  recordBrowserArtifact, setBrowserActionInvocation,
} from '@/lib/browser/store'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicResult(actionId: string, result: Record<string, unknown> | null) {
  return result ? { actionId, status: 'completed', observation: result } : { actionId, status: 'working' }
}

export async function GET(request: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const log = requestLogger(request, '/api/browser/navigate/[actionId]')
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'action', { minute: 40, daily: 600 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  const context = await getOptionalAuthContext()
  if (!context) return Response.json({ error: 'Sign in to continue browser work.' }, { status: 401, headers: log.headers() })
  if (!browserNavigationConfiguration().ready || !canUseBrowserPilot(context)) {
    return Response.json({ error: 'Visual browser work is not available.' }, { status: 403, headers: log.headers() })
  }

  const { actionId: rawActionId } = await params
  const actionId = rawActionId.slice(0, 120)
  const action = await loadBrowserAction(context.workspace.key, actionId)
  if (!action) return Response.json({ error: 'That browser action is not in this workspace.' }, { status: 404, headers: log.headers() })
  if (action.status === 'completed') return Response.json(publicResult(action.id, action.result), { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  if (action.status === 'failed') return Response.json({ actionId, status: 'failed', error: action.errorCode || 'browser_failed' }, {
    status: 422,
    headers: log.headers({ 'Cache-Control': 'no-store' }),
  })

  const invocationId = typeof action.result?.invocationId === 'string' ? action.result.invocationId : null
  if (!invocationId) return Response.json({ actionId, status: 'working' }, {
    status: 202,
    headers: log.headers({ 'Cache-Control': 'no-store', 'Retry-After': '2' }),
  })

  try {
    const invocation = await visualNavigationProvider().poll(invocationId)
    if (invocation.status === 'queued' || invocation.status === 'running') {
      await setBrowserActionInvocation({
        workspaceKey: context.workspace.key,
        actionId,
        invocationId,
        providerSessionId: invocation.providerSessionId,
        status: invocation.status,
      })
      return Response.json({ actionId, status: 'working' }, {
        status: 202,
        headers: log.headers({ 'Cache-Control': 'no-store', 'Retry-After': '2' }),
      })
    }
    if (invocation.status === 'failed' || !invocation.result) throw new BrowserProviderError('provider_rejected', 'Visual navigation failed.')

    const domains = browserAllowedDomains()
    const finalUrl = safePublicUrl(invocation.result.url, domains)
    if (!finalUrl) throw new BrowserProviderError('invalid_response', 'The worker left the approved domain scope.')
    const stored = await uploadBrowserScreenshot({
      workspaceKey: context.workspace.key,
      runId: action.runId,
      actionId,
      screenshot: invocation.result.screenshot,
    })
    const artifactId = `browser_artifact_${createHash('sha256').update(`${context.workspace.key}:${actionId}`).digest('hex').slice(0, 32)}`
    await recordBrowserArtifact({
      id: artifactId,
      workspaceKey: context.workspace.key,
      runId: action.runId,
      actionId,
      ...stored,
    })
    const result = {
      url: finalUrl.href,
      title: invocation.result.title,
      text: invocation.result.text,
      links: invocation.result.links.filter((link) => Boolean(safePublicUrl(link.url, domains))),
      truncated: invocation.result.truncated,
      warnings: invocation.result.warnings,
      untrustedContent: true,
      artifactId,
      artifactUrl: `/api/browser/artifacts/${artifactId}`,
      screenshotSha256: stored.sha256,
      screenshotExpiresAt: stored.expiresAt,
    }
    await completeBrowserAction({ workspaceKey: context.workspace.key, actionId, result, verified: Boolean(result.text) })
    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: action.runId,
      type: 'page.visually_observed',
      summary: `Captured ${result.title || finalUrl.hostname}`,
      payload: { actionId, artifactId, url: finalUrl.href, warnings: result.warnings },
    }).catch(() => undefined)
    log.finish(200, { outcome: 'visual_observation_complete', actionId, artifactId })
    return Response.json(publicResult(actionId, result), { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    await failBrowserAction({ workspaceKey: context.workspace.key, actionId, errorCode: 'visual_observation_failed' }).catch(() => undefined)
    await appendBrowserRunEvent({
      workspaceKey: context.workspace.key,
      runId: action.runId,
      type: 'browser.navigation_failed',
      summary: 'The page could not be captured',
      visibility: 'operator',
      payload: { actionId },
    }).catch(() => undefined)
    log.error('browser.navigation_poll_failed', errorDetails(error))
    log.finish(502, { outcome: 'visual_observation_failed', actionId })
    return Response.json({ actionId, status: 'failed', error: 'The page could not be captured.' }, {
      status: 502,
      headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }
}
