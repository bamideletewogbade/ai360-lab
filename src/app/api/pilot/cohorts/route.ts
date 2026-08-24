import { getOptionalAuthContext } from '@/lib/auth'
import { normalizePilotCohort } from '@/lib/billing/pilot-credits'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isPilotOperator } from '@/lib/pilot/access'
import { listPilotCohorts, readPilotCohortReport } from '@/lib/pilot/reporting'
import { isPostgresConfigured } from '@/lib/postgres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/pilot/cohorts')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to open pilot reporting.' }, { status: 401, headers: log.headers() })
    }
    if (!isPilotOperator(context)) {
      log.finish(403, { outcome: 'operator_required' })
      return Response.json({ error: 'This area is limited to approved pilot operators.' }, { status: 403, headers: log.headers() })
    }
    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({ error: 'Pilot reporting is not connected yet.' }, { status: 503, headers: log.headers() })
    }

    const requested = new URL(request.url).searchParams.get('cohort')
    if (!requested) {
      const cohorts = await listPilotCohorts()
      log.finish(200, { outcome: 'success', cohortCount: cohorts.length })
      return Response.json({ cohorts }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    }

    let cohort: string
    try {
      cohort = normalizePilotCohort(requested)
    } catch {
      log.finish(400, { outcome: 'invalid_cohort' })
      return Response.json({ error: 'Choose a valid pilot cohort.' }, { status: 400, headers: log.headers() })
    }

    const report = await readPilotCohortReport(cohort)
    log.finish(200, { outcome: 'success', cohort, testerCount: report.summary.testers })
    return Response.json(report, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('pilot.report_failed', errorDetails(error))
    log.finish(500, { outcome: 'report_failed' })
    return Response.json({ error: 'The pilot report could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
