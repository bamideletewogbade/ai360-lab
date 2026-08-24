import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'
import { listAdminCohorts, normalizeAdminCohort, readAdminCohortReport } from '@/lib/admin/cohorts'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isPostgresConfigured } from '@/lib/postgres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/admin/cohorts')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return Response.json({ error: 'Sign in to open cohort reporting.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(context)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Cohort reporting is not connected yet.' }, { status: 503, headers: log.headers() })
    const requested = new URL(request.url).searchParams.get('cohort')
    if (!requested) return Response.json({ cohorts: await listAdminCohorts() }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    let cohort: string
    try { cohort = normalizeAdminCohort(requested) } catch {
      return Response.json({ error: 'Choose a valid cohort.' }, { status: 400, headers: log.headers() })
    }
    const report = await readAdminCohortReport(cohort)
    log.finish(200, { outcome: 'success', cohort, userCount: report.summary.users })
    return Response.json(report, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.cohort_failed', errorDetails(error))
    log.finish(500, { outcome: 'cohort_failed' })
    return Response.json({ error: 'The cohort report could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
