import { getOptionalAuthContext } from '@/lib/auth'
import { loadRun } from '@/lib/agent/store'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * What happened to a run whose connection died.
 *
 * Polled rather than streamed on purpose. A long lived connection is exactly
 * what fails on a mobile network, so recovery must not depend on holding one
 * open. A client that lost its stream asks this every few seconds until the run
 * reaches a terminal state.
 *
 * A run is only ever visible to the workspace that owns it. The workspace comes
 * from the session, never from the request, so knowing a run id is not enough
 * to read someone else's work.
 */
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const log = requestLogger(request, '/api/agent/runs')
  try {
    // Generous, because this is how someone on a bad connection gets their work
    // back. Throttling recovery would punish exactly the situation it exists for.
    const limited = rateLimit(request, 'action', { minute: 40, daily: 600 }, await resolveRequester(request))
    if (limited) {
      log.finish(limited.status, { outcome: 'rate_limited' })
      return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
    }

    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to pick up where you left off.' }, {
        status: 401,
        headers: log.headers(),
      })
    }

    const { runId } = await params
    const run = await loadRun(context.workspace.key, runId.slice(0, 64))
    if (!run) {
      log.finish(404, { outcome: 'run_not_found' })
      return Response.json({ error: 'That run is not in this workspace.' }, {
        status: 404,
        headers: log.headers(),
      })
    }

    const finished = TERMINAL.has(run.status)
    log.finish(200, { outcome: 'success', runStatus: run.status, finished })
    return Response.json({
      runId: run.runId,
      status: run.status,
      finished,
      // Present while the run is working, so a returning client shows progress
      // rather than an empty screen.
      steps: run.steps,
      plan: run.plan,
      // Present once the run has produced something, whether or not anyone was
      // watching when it did.
      content: run.content,
      sources: run.sources,
      usage: run.usage,
      error: run.errorCode,
    }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('agent.run_lookup_failed', errorDetails(error))
    log.finish(500, { outcome: 'lookup_failed' })
    return Response.json({ error: 'That run could not be loaded.' }, {
      status: 500,
      headers: log.headers(),
    })
  }
}
