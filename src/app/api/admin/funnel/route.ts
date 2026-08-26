import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'
import { isPostgresConfigured } from '@/lib/postgres'
import { readFunnelReport, isMissingFunnelTable } from '@/lib/funnel/repository'
import { normalizeAdminCohort } from '@/lib/admin/cohorts'
import { adminRangeStart, parseAdminRange } from '@/lib/admin/contracts'
import { errorDetails, requestLogger } from '@/lib/observability'

export const dynamic = 'force-dynamic'

/**
 * The pre-activation funnel, for operators only.
 *
 * It names invited people who stalled, so it sits behind the same gate as the
 * cohort report rather than behind a weaker one.
 */
export async function GET(request: Request) {
  const log = requestLogger(request, 'admin.funnel')

  const context = await getOptionalAuthContext()
  if (!context) return Response.json({ error: 'Sign in required.' }, { status: 401, headers: log.headers() })
  if (!isAdminOperator(context)) {
    return Response.json({ error: 'Not found.' }, { status: 404, headers: log.headers() })
  }
  if (!isPostgresConfigured()) {
    return Response.json({ error: 'The reporting database is not configured.' }, { status: 503, headers: log.headers() })
  }

  const url = new URL(request.url)
  const range = parseAdminRange(url.searchParams.get('range'))
  const rawCohort = url.searchParams.get('cohort')

  let cohort: string | null = null
  if (rawCohort) {
    try {
      cohort = normalizeAdminCohort(rawCohort)
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Invalid cohort.' },
        { status: 400, headers: log.headers() },
      )
    }
  }

  try {
    const start = adminRangeStart(range)
    const report = await readFunnelReport({
      since: start ? start.toISOString() : null,
      cohort,
    })
    return Response.json({ range, ...report }, {
      headers: log.headers({ 'Cache-Control': 'private, no-store' }),
    })
  } catch (error) {
    if (isMissingFunnelTable(error)) {
      return Response.json(
        { error: 'Funnel reporting is unavailable until migration 0028 is applied.' },
        { status: 503, headers: log.headers() },
      )
    }
    log.error('admin.funnel_failed', errorDetails(error))
    return Response.json({ error: 'Could not build the funnel report.' }, { status: 500, headers: log.headers() })
  }
}
