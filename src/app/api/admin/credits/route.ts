import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { canManageAdminCredits } from '@/lib/admin/access'
import { grantCredits } from '@/lib/billing/credit-repository'
import { createWorkspaceAuthContext } from '@/lib/workspace'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isMissingAdminAuditTable } from '@/lib/admin/audit'

export const runtime = 'nodejs'

const CreditAction = z.object({
  userId: z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  action: z.enum(['grant', 'refund']),
  credits: z.number().int().min(1).max(10_000),
  reason: z.string().trim().min(3).max(240),
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/),
})

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/credits')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to manage credits.' }, { status: 401, headers: log.headers() })
    if (!canManageAdminCredits(operator)) return Response.json({ error: 'Credit-manager access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Credit management is not connected yet.' }, { status: 503, headers: log.headers() })
    const parsed = CreditAction.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Check the user, amount, and reason.' }, { status: 400, headers: log.headers() })
    const body = parsed.data
    const sql = getPostgres()
    const [target] = await sql<{ clerk_user_id: string; email: string | null; display_name: string | null }[]>`
      select clerk_user_id, email, display_name from public.lab_users
       where clerk_user_id = ${body.userId} and deleted_at is null limit 1`
    if (!target) return Response.json({ error: 'That user could not be found.' }, { status: 404, headers: log.headers() })
    const targetContext = createWorkspaceAuthContext({
      userId: target.clerk_user_id, email: target.email,
      displayName: target.display_name,
    })
    const result = await grantCredits({
      context: targetContext, credits: body.credits,
      sourceType: body.action === 'refund' ? 'refund' : 'adjustment',
      sourceId: `admin-${body.action}`,
      idempotencyKey: `admin:${operator.userId}:${body.idempotencyKey}`,
      operatorAudit: {
        actorId: operator.userId,
        action: body.action === 'refund' ? 'credit_refund' : 'credit_grant',
        reason: body.reason, requestId: log.requestId,
      },
    })
    if (!result.granted) {
      const status = result.reason === 'already_granted' ? 409 : 400
      return Response.json({ error: result.reason === 'already_granted' ? 'This credit action was already applied.' : 'The credits could not be applied.' }, { status, headers: log.headers() })
    }
    log.info('admin.credit_applied', { action: body.action, credits: body.credits, targetUserId: body.userId })
    log.finish(200, { outcome: 'success', action: body.action, credits: body.credits })
    return Response.json({
      applied: true, action: body.action, credits: body.credits,
      balanceBefore: result.balanceBefore, balanceAfter: result.balanceAfter,
    }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.credit_failed', errorDetails(error))
    if (isMissingAdminAuditTable(error)) {
      log.finish(503, { outcome: 'audit_migration_required' })
      return Response.json({
        error: 'Credit management is temporarily read-only while the admin audit migration is applied.',
      }, { status: 503, headers: log.headers() })
    }
    log.finish(500, { outcome: 'credit_failed' })
    return Response.json({ error: 'The credit action could not be completed.' }, { status: 500, headers: log.headers() })
  }
}
