import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator, canManageAdminCredits, canManageAdminPrograms, canSendAdminEmail } from '@/lib/admin/access'
import { parseAdminRange } from '@/lib/admin/contracts'
import { readAdminDashboardData } from '@/lib/admin/repository'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isPostgresConfigured } from '@/lib/postgres'
import { isEmailConfigured } from '@/lib/email/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/admin/overview')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return Response.json({ error: 'Sign in to open the admin console.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(context)) return Response.json({ error: 'This area is limited to approved operators.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin reporting is not connected yet.' }, { status: 503, headers: log.headers() })
    const range = parseAdminRange(new URL(request.url).searchParams.get('range'))
    const dashboard = await readAdminDashboardData(range)
    if (!dashboard.infrastructure.auditTrailReady) {
      log.info('admin.audit_migration_required', { range })
    }
    log.finish(200, { outcome: 'success', range, userCount: dashboard.summary.users })
    return Response.json({
      ...dashboard,
      capabilities: {
        manageCredits: dashboard.infrastructure.auditTrailReady && canManageAdminCredits(context),
        managePrograms: dashboard.infrastructure.programOperationsReady && canManageAdminPrograms(context),
        sendParticipantEmail: dashboard.infrastructure.programOperationsReady
          && isEmailConfigured() && canSendAdminEmail(context),
        runAiInsights: Boolean(process.env.OPENROUTER_API_KEY),
      },
    }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.overview_failed', errorDetails(error))
    log.finish(500, { outcome: 'overview_failed' })
    return Response.json({ error: 'The admin console could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
