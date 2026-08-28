import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { canManageAdminCredits, canManageAdminPrograms, isAdminOperator } from '@/lib/admin/access'
import {
  classifyImportRows,
  createAdminInvitations,
  isMissingAdminInvitationTables,
  updateMissingAdminInvitationNames,
} from '@/lib/admin/invitations'
import { MAX_IMPORT_ROWS, parseParticipantList } from '@/lib/admin/participant-import'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'

/**
 * Turns an operator's participant list into invitations.
 *
 * Split into preview and commit for the same reason the email action is:
 * an operator should see exactly who a bulk action will touch, and why the rest
 * were left out, before anything is written. Preview reads but never writes, so
 * it can be run as often as the operator likes while they clean up their list.
 */

/** Generous enough for a 500-row list with names, small enough to bound work. */
const MAX_CONTENT_BYTES = 512 * 1024

const ImportRequest = z.object({
  mode: z.enum(['preview', 'commit']),
  content: z.string().max(MAX_CONTENT_BYTES),
  programKey: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).default('pilot'),
  cohortKey: z.string().trim().min(2).max(120).nullable().default(null),
  participationStatus: z.enum(['invited', 'enrolled']).default('enrolled'),
  credits: z.number().int().min(0).max(10_000).default(0),
  reason: z.string().trim().min(3).max(240),
  // Doubles as the batch label, so an operator can find or revoke one upload.
  importKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/),
})

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/participants/import')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to import participants.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!canManageAdminPrograms(operator)) return Response.json({ error: 'Program-manager access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin operations are not connected yet.' }, { status: 503, headers: log.headers() })

    const parsed = ImportRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Review the list and the import details.' }, { status: 400, headers: log.headers() })
    const body = parsed.data
    if (body.credits > 0 && !canManageAdminCredits(operator)) {
      return Response.json({ error: 'Credit-manager access is required to include extra credits.' }, { status: 403, headers: log.headers() })
    }

    const preview = await classifyImportRows(parseParticipantList(body.content), body.programKey)

    if (body.mode === 'preview') {
      log.finish(200, { outcome: 'success', mode: 'preview', ready: preview.ready.length, updates: preview.updates.length, skipped: preview.skipped.length })
      return Response.json({ ...preview, maxRows: MAX_IMPORT_ROWS }, {
        headers: log.headers({ 'Cache-Control': 'private, no-store' }),
      })
    }

    if (!preview.ready.length && !preview.updates.length) {
      return Response.json({ error: 'None of these addresses would create or improve an invitation.' }, { status: 400, headers: log.headers() })
    }

    const created = await createAdminInvitations({
      rows: preview.ready.map((row) => ({
        email: row.email, displayName: row.displayName, cohortKey: row.cohortKey,
      })),
      programKey: body.programKey,
      defaultCohortKey: body.cohortKey,
      participationStatus: body.participationStatus,
      startingCredits: body.credits,
      actorId: operator.userId,
      reason: body.reason,
      importKey: body.importKey,
    })
    const updated = await updateMissingAdminInvitationNames({
      rows: preview.updates.map((row) => ({ email: row.email, displayName: row.displayName })),
      programKey: body.programKey,
      actorId: operator.userId,
      reason: body.reason,
      importKey: body.importKey,
    })

    log.finish(200, {
      outcome: 'success', mode: 'commit', created: created.length, namesUpdated: updated.length, offered: preview.ready.length,
    })
    return Response.json({
      created: created.length,
      invitations: created,
      namesUpdated: updated.length,
      // A re-submitted import creates nothing; saying so beats a silent success.
      unchanged: preview.ready.length - created.length,
      skipped: preview.skipped,
      counts: preview.counts,
    }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.participant_import_failed', errorDetails(error))
    if (isMissingAdminInvitationTables(error)) {
      log.finish(503, { outcome: 'invitation_migration_required' })
      return Response.json({ error: 'Participant invitations are unavailable until migration 0026 is applied.' }, { status: 503, headers: log.headers() })
    }
    log.finish(500, { outcome: 'import_failed' })
    return Response.json({ error: 'The participant list could not be imported.' }, { status: 500, headers: log.headers() })
  }
}
