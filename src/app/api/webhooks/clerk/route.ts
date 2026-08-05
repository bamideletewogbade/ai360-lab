import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
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

  if (!isPostgresConfigured()) {
    log.finish(503, { outcome: 'database_not_configured', eventType: event.type })
    return Response.json({ error: 'Identity synchronization is temporarily unavailable.' }, { status: 503, headers: log.headers() })
  }

  const eventId = webhookEventId(request.headers.get('svix-id'))
  if (!eventId) {
    log.finish(400, { outcome: 'missing_event_id', eventType: event.type })
    return Response.json({ error: 'Webhook event ID is missing.' }, { status: 400, headers: log.headers() })
  }

  try {
    const sql = getPostgres()
    const result = await sql.begin(async (tx) => {
      // The receipt is the idempotency guard: if this event has been seen
      // before, the insert affects nothing and the work is skipped entirely.
      const receipt = await tx`
        insert into public.lab_webhook_events (event_id, event_type)
        values (${eventId}, ${event.type})
        on conflict (event_id) do nothing`
      if (!receipt.count) return 'duplicate'

      if (event.type === 'user.created' || event.type === 'user.updated') {
        const profile = clerkUserProfile(event.data)
        if (!profile.id) throw new Error('Clerk user event has no user ID')
        await tx`
          insert into public.lab_users (clerk_user_id, email, display_name, image_url, deleted_at)
          values (${profile.id}, ${profile.email}, ${profile.displayName}, ${profile.imageUrl}, null)
          on conflict (clerk_user_id) do update set
            email = excluded.email, display_name = excluded.display_name,
            image_url = excluded.image_url, deleted_at = null, updated_at = now()`
        await tx`
          insert into public.lab_workspaces
            (workspace_key, workspace_type, subject_id, created_by_user_id, display_name, deleted_at)
          values (${`user:${profile.id}`}, 'user', ${profile.id}, ${profile.id}, ${profile.displayName}, null)
          on conflict (workspace_key) do update set
            display_name = excluded.display_name, deleted_at = null, updated_at = now()`
      } else if (event.type === 'user.deleted') {
        const userId = typeof event.data.id === 'string' ? event.data.id : null
        if (!userId) throw new Error('Clerk user deletion has no user ID')
        await tx`update public.lab_users set deleted_at = now(), updated_at = now() where clerk_user_id = ${userId}`
        await tx`update public.lab_workspace_memberships set status = 'inactive' where user_id = ${userId}`
      } else if (event.type === 'organization.created' || event.type === 'organization.updated') {
        await tx`
          insert into public.lab_workspaces
            (workspace_key, workspace_type, subject_id, display_name, slug, deleted_at)
          values (${`org:${event.data.id}`}, 'organization', ${event.data.id}, ${event.data.name}, ${event.data.slug || null}, null)
          on conflict (workspace_key) do update set
            display_name = excluded.display_name, slug = excluded.slug,
            deleted_at = null, updated_at = now()`
      } else if (event.type === 'organization.deleted') {
        const orgId = typeof event.data.id === 'string' ? event.data.id : null
        if (!orgId) throw new Error('Clerk organization deletion has no organization ID')
        await tx`update public.lab_workspaces set deleted_at = now(), updated_at = now() where workspace_key = ${`org:${orgId}`}`
        await tx`update public.lab_workspace_memberships set status = 'inactive' where workspace_key = ${`org:${orgId}`}`
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
        await tx`
          insert into public.lab_users (clerk_user_id, display_name)
          values (${userId}, ${profile.displayName})
          on conflict (clerk_user_id) do update set
            display_name = coalesce(excluded.display_name, public.lab_users.display_name),
            updated_at = now()`
        await tx`
          insert into public.lab_workspaces (workspace_key, workspace_type, subject_id, display_name)
          values (${`org:${orgId}`}, 'organization', ${orgId}, ${event.data.organization.name})
          on conflict (workspace_key) do update set
            display_name = excluded.display_name, updated_at = now()`
        await tx`
          insert into public.lab_workspace_memberships (workspace_key, user_id, role, status)
          values (${`org:${orgId}`}, ${userId}, ${event.data.role || 'org:member'},
                  ${event.type === 'organizationMembership.deleted' ? 'inactive' : 'active'})
          on conflict (workspace_key, user_id) do update set
            role = excluded.role, status = excluded.status, updated_at = now()`
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
