import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isQualityReviewer } from '@/lib/quality/access'
import { listQualityQueue } from '@/lib/quality/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/quality/cases')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to open the quality desk.' }, { status: 401, headers: log.headers() })
    }
    if (!isQualityReviewer(context)) {
      log.finish(403, { outcome: 'reviewer_required' })
      return Response.json({ error: 'This area is for approved quality reviewers.' }, { status: 403, headers: log.headers() })
    }
    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({ error: 'The quality desk is not connected yet.' }, { status: 503, headers: log.headers() })
    }
    const queue = await listQualityQueue()
    log.finish(200, { outcome: 'success', caseCount: queue.reports.length })
    return Response.json(queue, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('quality.queue_failed', errorDetails(error))
    log.finish(500, { outcome: 'queue_failed' })
    return Response.json({ error: 'The quality queue could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}

