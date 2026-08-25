import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'
import { readAdminDashboardData } from '@/lib/admin/repository'
import { buildXlsx } from '@/lib/export/xlsx'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'

const ExportRequest = z.object({
  userIds: z.array(z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/)).min(1).max(1000),
  fileName: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/).default('ai360-participants'),
})

function value(input: string | number | null | undefined) {
  return input === null || input === undefined ? '' : String(input)
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/export')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to export participant data.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Participant reporting is not connected yet.' }, { status: 503, headers: log.headers() })
    const parsed = ExportRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Choose at least one valid participant.' }, { status: 400, headers: log.headers() })

    const requestedIds = new Set(parsed.data.userIds)
    const dashboard = await readAdminDashboardData('all')
    const users = dashboard.users.filter((user) => requestedIds.has(user.id))
    if (!users.length) return Response.json({ error: 'None of the selected participants could be found.' }, { status: 404, headers: log.headers() })

    const rows = users.map((user) => [
      user.email,
      value(user.displayName),
      user.id,
      value(user.participation?.programKey),
      value(user.participation?.cohortKey),
      value(user.participation?.participationStatus),
      value(user.participation?.feedbackStatus),
      value(user.participation?.emailStatus),
      user.status,
      value(user.availableCredits),
      value(user.creditsSpent),
      value(user.activeDays),
      value(user.lastActiveAt),
      value(user.successfulRequests),
      value(user.failedRequests),
      value(user.providerCostUsd),
    ])
    const workbook = await buildXlsx([{
      name: 'Participants',
      rows: [[
        'Email', 'Display name', 'User ID', 'Program', 'Cohort', 'Participation stage',
        'Feedback stage', 'Email status', 'Activity status', 'Credits available',
        'Credits used', 'Active days', 'Last active', 'Successful requests',
        'Failed requests', 'Provider cost USD',
      ], ...rows],
      freezeHeader: true,
      autoFilter: true,
      columnWidths: [30, 22, 24, 14, 18, 20, 18, 16, 16, 17, 14, 13, 22, 20, 16, 18],
    }])
    log.finish(200, { outcome: 'success', userCount: users.length, format: 'xlsx' })
    return new Response(new Uint8Array(workbook), {
      headers: log.headers({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${parsed.data.fileName}.xlsx"`,
      }),
    })
  } catch (error) {
    log.error('admin.export_failed', errorDetails(error))
    log.finish(500, { outcome: 'export_failed' })
    return Response.json({ error: 'The Excel report could not be created.' }, { status: 500, headers: log.headers() })
  }
}
