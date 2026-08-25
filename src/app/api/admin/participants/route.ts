import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { canManageAdminPrograms, isAdminOperator } from '@/lib/admin/access'
import {
  isMissingAdminInvitationTables,
  readAdminInvitations,
  revokeAdminInvitations,
} from '@/lib/admin/invitations'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Pending participants, listed beside the accounts that already exist. */
export async function GET(request: Request) {
  const log = requestLogger(request, '/api/admin/participants')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to view invitations.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin reporting is not connected yet.' }, { status: 503, headers: log.headers() })

    const programKey = new URL(request.url).searchParams.get('programKey')?.trim() || 'pilot'
    if (!/^[A-Za-z0-9._:-]{2,80}$/.test(programKey)) {
      return Response.json({ error: 'Invalid program.' }, { status: 400, headers: log.headers() })
    }
    const { ready, invitations } = await readAdminInvitations(programKey)
    log.finish(200, { outcome: 'success', ready, count: invitations.length })
    return Response.json({ ready, invitations }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.invitations_failed', errorDetails(error))
    log.finish(500, { outcome: 'list_failed' })
    return Response.json({ error: 'Invitations could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}

const RevokeRequest = z.object({
  action: z.literal('revoke'),
  invitationIds: z.array(z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/)).min(1).max(500),
  programKey: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).default('pilot'),
  reason: z.string().trim().min(3).max(240),
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/),
})

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/participants')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to manage invitations.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!canManageAdminPrograms(operator)) return Response.json({ error: 'Program-manager access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin operations are not connected yet.' }, { status: 503, headers: log.headers() })

    const parsed = RevokeRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Review the selected invitations.' }, { status: 400, headers: log.headers() })

    const revoked = await revokeAdminInvitations({
      ids: [...new Set(parsed.data.invitationIds)],
      programKey: parsed.data.programKey,
      actorId: operator.userId,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    })
    log.finish(200, { outcome: 'success', revoked: revoked.length })
    return Response.json({ revoked: revoked.length, invitationIds: revoked }, {
      headers: log.headers({ 'Cache-Control': 'private, no-store' }),
    })
  } catch (error) {
    log.error('admin.invitation_revoke_failed', errorDetails(error))
    if (isMissingAdminInvitationTables(error)) {
      log.finish(503, { outcome: 'invitation_migration_required' })
      return Response.json({ error: 'Participant invitations are unavailable until migration 0026 is applied.' }, { status: 503, headers: log.headers() })
    }
    log.finish(500, { outcome: 'revoke_failed' })
    return Response.json({ error: 'The invitations could not be revoked.' }, { status: 500, headers: log.headers() })
  }
}
