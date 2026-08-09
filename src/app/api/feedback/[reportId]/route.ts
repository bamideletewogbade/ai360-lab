import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { readCustomerQualityReceipt } from '@/lib/quality/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const log = requestLogger(request, '/api/feedback/[reportId]')
  if (!isPostgresConfigured()) {
    log.finish(503, { outcome: 'database_not_configured' })
    return Response.json({ error: 'Feedback status is not available yet.' }, { status: 503, headers: log.headers() })
  }
  try {
    const { reportId } = await params
    if (!/^ql_[a-z0-9_]+$/.test(reportId)) {
      log.finish(400, { outcome: 'invalid_report_id' })
      return Response.json({ error: 'That report reference is not valid.' }, { status: 400, headers: log.headers() })
    }
    const context = await getOptionalAuthContext().catch(() => null)
    const token = new URL(request.url).searchParams.get('token')
    const receipt = await readCustomerQualityReceipt({ id: reportId, token, context })
    if (!receipt) {
      log.finish(404, { outcome: 'report_not_found' })
      return Response.json({ error: 'That report could not be found.' }, { status: 404, headers: log.headers() })
    }
    log.finish(200, { outcome: 'success', reportId })
    return Response.json(receipt, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('quality.receipt_failed', errorDetails(error))
    log.finish(500, { outcome: 'receipt_failed' })
    return Response.json({ error: 'The report status could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}

