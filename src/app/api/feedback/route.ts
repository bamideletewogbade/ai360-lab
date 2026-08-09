import { after } from 'next/server'
import { feedbackRequestSchema } from '@/lib/quality/contracts'
import { createQualityReport } from '@/lib/quality/repository'
import { evaluateQualityReport } from '@/lib/quality/steward'
import { triageFeedback } from '@/lib/quality/triage'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/feedback')
  const tooLarge = rejectLargeRequest(request, 40_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return Response.json({ error: 'This report is too large. Please shorten the details.' }, { status: 413, headers: log.headers() })
  }
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'feedback', { minute: 10, daily: 100 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }
  if (!isPostgresConfigured()) {
    log.finish(503, { outcome: 'database_not_configured' })
    return Response.json({ error: 'Feedback is not available yet. Please try again later.' }, { status: 503, headers: log.headers() })
  }

  try {
    const parsed = feedbackRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      log.finish(400, { outcome: 'invalid_feedback' })
      return Response.json({ error: 'Please check the report and try again.' }, { status: 400, headers: log.headers() })
    }
    const triage = triageFeedback(parsed.data)
    const report = await createQualityReport(parsed.data, triage, requester.context)
    after(async () => {
      try {
        await evaluateQualityReport(report.id)
      } catch (error) {
        log.error('quality.evaluation_failed', { reportId: report.id, ...errorDetails(error) })
      }
    })
    log.finish(201, {
      outcome: 'feedback_received',
      reportId: report.id,
      severity: report.severity,
      category: parsed.data.category,
    })
    return Response.json({
      id: report.id,
      token: report.token,
      status: report.status,
      message: report.severity === 's0' || report.severity === 's1'
        ? 'Thank you. This has been placed in the urgent human review queue.'
        : parsed.data.sentiment === 'helpful'
          ? 'Thank you. This helps us understand what is working.'
          : 'Thank you. We will check this and use it to improve AI360.',
    }, { status: 201, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('quality.feedback_failed', errorDetails(error))
    log.finish(500, { outcome: 'feedback_failed' })
    return Response.json({ error: 'Your report could not be saved. Please try again.' }, { status: 500, headers: log.headers() })
  }
}

