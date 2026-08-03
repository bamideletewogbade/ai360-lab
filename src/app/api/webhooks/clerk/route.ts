import type { ResultSetHeader } from 'mysql2'
import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { isDatabaseConfigured, withTransaction } from '@/lib/mysql'
import { clerkUserProfile, webhookEventId } from '@/lib/clerk-sync'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const log = requestLogger(request, '/api/webhooks/clerk')
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    log.finish(503, { outcome: 'webhook_not_configured' })
    return Response.json({ error: 'Webhook synchronization is not configured.' }, { status: 503, headers: log.headers() })
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    event = await verifyWebhook(request)
  } catch (error) {
    log.warn('clerk.webhook.verification_failed', errorDetails(error))
    log.finish(400, { outcome: 'invalid_signature' })
    return Response.json({ error: 'Webhook verification failed.' }, { status: 400, headers: log.headers() })
  }

  if (!isDatabaseConfigured()) {
    log.finish(503, { outcome: 'database_not_configured', eventType: event.type })
    return Response.json({ error: 'Identity synchronization is temporarily unavailable.' }, { status: 503, headers: log.headers() })
  }

  const eventId = webhookEventId(request.headers.get('svix-id'))
  if (!eventId) {
    log.finish(400, { outcome: 'missing_event_id', eventType: event.type })
    return Response.json({ error: 'Webhook event ID is missing.' }, { status: 400, headers: log.headers() })
  }

  try {
    const result = await withTransaction(async (connection) => {
      const [receipt] = await connection.execute<ResultSetHeader>(
        'INSERT IGNORE INTO lab_webhook_events (event_id, event_type) VALUES (?, ?)',
        [eventId, event.type],
      )
      if (!receipt.affectedRows) return 'duplicate'

      if (event.type === 'user.created' || event.type === 'user.updated') {
        const profile = clerkUserProfile(event.data)
        if (!profile.id) throw new Error('Clerk user event has no user ID')
        await connection.execute(
          `INSERT INTO lab_users (clerk_user_id, email, display_name, image_url, deleted_at)
           VALUES (?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name),
             image_url = VALUES(image_url), deleted_at = NULL`,
          [profile.id, profile.email, profile.displayName, profile.imageUrl],
        )
        await connection.execute(
          `INSERT INTO lab_workspaces
            (workspace_key, workspace_type, subject_id, created_by_user_id, display_name, deleted_at)
           VALUES (?, 'user', ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), deleted_at = NULL`,
          [`user:${profile.id}`, profile.id, profile.id, profile.displayName],
        )
      } else if (event.type === 'user.deleted') {
        const userId = typeof event.data.id === 'string' ? event.data.id : null
        if (!userId) throw new Error('Clerk user deletion has no user ID')
        await connection.execute('UPDATE lab_users SET deleted_at = CURRENT_TIMESTAMP WHERE clerk_user_id = ?', [userId])
        await connection.execute("UPDATE lab_workspace_memberships SET status = 'inactive' WHERE user_id = ?", [userId])
      } else if (event.type === 'organization.created' || event.type === 'organization.updated') {
        await connection.execute(
          `INSERT INTO lab_workspaces
            (workspace_key, workspace_type, subject_id, display_name, slug, deleted_at)
           VALUES (?, 'organization', ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), slug = VALUES(slug), deleted_at = NULL`,
          [`org:${event.data.id}`, event.data.id, event.data.name, event.data.slug || null],
        )
      } else if (event.type === 'organization.deleted') {
        const orgId = typeof event.data.id === 'string' ? event.data.id : null
        if (!orgId) throw new Error('Clerk organization deletion has no organization ID')
        await connection.execute('UPDATE lab_workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE workspace_key = ?', [`org:${orgId}`])
        await connection.execute("UPDATE lab_workspace_memberships SET status = 'inactive' WHERE workspace_key = ?", [`org:${orgId}`])
      } else if (
        event.type === 'organizationMembership.created' ||
        event.type === 'organizationMembership.updated' ||
        event.type === 'organizationMembership.deleted'
      ) {
        const orgId = event.data.organization.id
        const userId = event.data.public_user_data.user_id
        const profile = clerkUserProfile({
          id: userId,
          first_name: event.data.public_user_data.first_name,
          last_name: event.data.public_user_data.last_name,
        })
        await connection.execute(
          `INSERT INTO lab_users (clerk_user_id, display_name)
           VALUES (?, ?) ON DUPLICATE KEY UPDATE display_name = COALESCE(VALUES(display_name), display_name)`,
          [userId, profile.displayName],
        )
        await connection.execute(
          `INSERT INTO lab_workspaces (workspace_key, workspace_type, subject_id, display_name)
           VALUES (?, 'organization', ?, ?)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
          [`org:${orgId}`, orgId, event.data.organization.name],
        )
        await connection.execute(
          `INSERT INTO lab_workspace_memberships (workspace_key, user_id, role, status)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status)`,
          [
            `org:${orgId}`,
            userId,
            event.data.role || 'org:member',
            event.type === 'organizationMembership.deleted' ? 'inactive' : 'active',
          ],
        )
      }
      return 'processed'
    })

    log.info('clerk.webhook.processed', { eventType: event.type, result })
    log.finish(200, { outcome: result, eventType: event.type })
    return Response.json({ ok: true, result }, { headers: log.headers() })
  } catch (error) {
    log.error('clerk.webhook.failed', { eventType: event.type, ...errorDetails(error) })
    log.finish(500, { outcome: 'sync_failed', eventType: event.type })
    return Response.json({ error: 'Identity synchronization failed.' }, { status: 500, headers: log.headers() })
  }
}
