import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isQualityReviewer } from '@/lib/quality/access'
import { qualityReviewUpdateSchema } from '@/lib/quality/contracts'
import { updateQualityReview } from '@/lib/quality/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const log = requestLogger(request, '/api/quality/cases/[reportId]')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to review this case.' }, { status: 401, headers: log.headers() })
    }
    if (!isQualityReviewer(context)) {
      log.finish(403, { outcome: 'reviewer_required' })
      return Response.json({ error: 'This area is for approved quality reviewers.' }, { status: 403, headers: log.headers() })
    }
    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({ error: 'The quality desk is not connected yet.' }, { status: 503, headers: log.headers() })
    }
    const { reportId } = await params
    if (!/^ql_[a-z0-9_]+$/.test(reportId)) {
      log.finish(400, { outcome: 'invalid_report_id' })
      return Response.json({ error: 'That case reference is not valid.' }, { status: 400, headers: log.headers() })
    }
    const parsed = qualityReviewUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      log.finish(400, { outcome: 'invalid_review' })
      return Response.json({ error: 'Add a short review note and choose a valid status.' }, { status: 400, headers: log.headers() })
    }
    const changed = await updateQualityReview({
      id: reportId,
      status: parsed.data.status,
      note: parsed.data.note,
      reviewerId: context.userId,
    })
    if (!changed) {
      log.finish(404, { outcome: 'case_not_found' })
      return Response.json({ error: 'That case could not be found.' }, { status: 404, headers: log.headers() })
    }
    log.finish(200, { outcome: 'review_updated', reportId, status: parsed.data.status })
    return Response.json({ id: reportId, status: parsed.data.status }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('quality.review_failed', errorDetails(error))
    log.finish(500, { outcome: 'review_failed' })
    return Response.json({ error: 'The review could not be saved.' }, { status: 500, headers: log.headers() })
  }
}

