import { NextResponse } from 'next/server'
import { getOptionalAuthContext } from '@/lib/auth'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { studioDraftSchema } from '@/lib/studio-draft'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(logger: ReturnType<typeof requestLogger>, body: unknown, status = 200) {
  logger.finish(status)
  return NextResponse.json(body, { status, headers: logger.headers({ 'Cache-Control': 'no-store' }) })
}

export async function GET(request: Request) {
  const logger = requestLogger(request, '/api/project-draft')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: 'Sign in to sync this project brief.' }, 401)
    if (!isPostgresConfigured()) return response(logger, { error: 'Cloud project sync is not configured.' }, 503)

    const sql = getPostgres()
    const draft = await sql.begin(async (tx) => {
      await ensureWorkspaceRecord(tx, context)
      const [row] = await tx<{ draft_data: unknown }[]>`
        select draft_data from public.lab_studio_drafts
         where workspace_key = ${context.workspace.key}
         order by client_updated_at desc limit 1`
      const parsed = studioDraftSchema.safeParse(row?.draft_data)
      return parsed.success ? parsed.data : null
    })
    return response(logger, { draft })
  } catch (error) {
    logger.error('studio.draft.load_failed', errorDetails(error))
    return response(logger, { error: 'The saved project brief could not be loaded.' }, 500)
  }
}

export async function PUT(request: Request) {
  const logger = requestLogger(request, '/api/project-draft')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: 'Sign in to sync this project brief.' }, 401)
    if (!isPostgresConfigured()) return response(logger, { error: 'Cloud project sync is not configured.' }, 503)
    const parsed = studioDraftSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return response(logger, { error: 'This project brief is invalid or too large.' }, 400)

    const draft = parsed.data
    const sql = getPostgres()
    await sql.begin(async (tx) => {
      await ensureWorkspaceRecord(tx, context)
      await tx`
        insert into public.lab_studio_drafts
          (id, workspace_key, owner_id, draft_data, client_updated_at)
        values (${draft.id}, ${context.workspace.key}, ${context.userId}, ${tx.json(draft)}, ${draft.updatedAt})
        on conflict (workspace_key, id) do update set
          draft_data = case when excluded.client_updated_at >= public.lab_studio_drafts.client_updated_at
                            then excluded.draft_data else public.lab_studio_drafts.draft_data end,
          client_updated_at = greatest(public.lab_studio_drafts.client_updated_at, excluded.client_updated_at),
          updated_at = now()`
    })
    return response(logger, { ok: true })
  } catch (error) {
    logger.error('studio.draft.save_failed', errorDetails(error))
    return response(logger, { error: 'The project brief could not be saved.' }, 500)
  }
}

export async function DELETE(request: Request) {
  const logger = requestLogger(request, '/api/project-draft')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: 'Sign in to remove this project brief.' }, 401)
    if (!isPostgresConfigured()) return response(logger, { error: 'Cloud project sync is not configured.' }, 503)
    const id = new URL(request.url).searchParams.get('id')?.slice(0, 64)
    if (!id) return response(logger, { error: 'The project brief ID is missing.' }, 400)
    const sql = getPostgres()
    await sql`delete from public.lab_studio_drafts where workspace_key = ${context.workspace.key} and id = ${id}`
    return response(logger, { ok: true })
  } catch (error) {
    logger.error('studio.draft.delete_failed', errorDetails(error))
    return response(logger, { error: 'The project brief could not be removed.' }, 500)
  }
}
