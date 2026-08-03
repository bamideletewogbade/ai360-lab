import { NextResponse } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { isDatabaseConfigured, withTransaction } from '@/lib/mysql'
import { errorDetails, requestLogger } from '@/lib/observability'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const intakeSchema = z.object({
  businessName: z.string().min(1).max(255),
  industry: z.string().max(255),
  offer: z.string().max(20_000),
  audience: z.string().max(20_000),
  goal: z.string().max(500),
  location: z.string().max(255),
  channels: z.array(z.string().max(100)).max(20),
  notes: z.string().max(60_000),
})

const brandSchema = z.object({
  summary: z.string().max(30_000),
  audience: z.string().max(20_000),
  personality: z.array(z.string().max(100)).max(20),
  voice: z.string().max(10_000),
  colors: z.array(z.object({
    name: z.string().max(100),
    hex: z.string().max(20),
    role: z.string().max(255),
  })).max(20),
  tagline: z.string().max(1_000),
  valueProposition: z.string().max(10_000),
})

const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  objective: z.string().max(10_000),
  bigIdea: z.string().max(20_000),
  callToAction: z.string().max(5_000),
  channels: z.array(z.string().max(100)).max(20),
  successMeasures: z.array(z.string().max(2_000)).max(30),
})

const assetSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['strategy', 'messaging', 'whatsapp', 'social', 'flyer', 'direct', 'logo', 'video']),
  title: z.string().max(255),
  channel: z.string().max(255),
  purpose: z.string().max(5_000),
  content: z.string().max(250_000),
  status: z.enum(['draft', 'approved']).optional(),
})

const projectSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  intake: intakeSchema,
  brand: brandSchema,
  campaign: campaignSchema,
  assets: z.array(assetSchema).max(50),
  sources: z.array(z.object({
    title: z.string().max(500),
    url: z.url().max(4_000),
  })).max(50).optional(),
})

const lifecycleSchema = z.object({
  id: z.string().min(1).max(64),
  action: z.enum(['archive', 'restore']),
})

type ProjectRow = RowDataPacket & {
  project_data: string | Record<string, unknown>
  archived_at: string | number | null
}

function response(logger: ReturnType<typeof requestLogger>, body: unknown, status = 200) {
  logger.finish(status)
  return NextResponse.json(body, { status, headers: logger.headers() })
}

export async function GET(request: Request) {
  const logger = requestLogger(request, '/api/projects')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: { code: 'AUTH_REQUIRED', message: 'Sign in to sync projects.' } }, 401)
    if (!isDatabaseConfigured()) return response(logger, { error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Cloud project sync is not configured yet.' } }, 503)

    const projects = await withTransaction(async (connection) => {
      await ensureWorkspaceRecord(connection, context)
      const [rows] = await connection.query<ProjectRow[]>(
        `SELECT project_data, archived_at FROM lab_studio_projects
         WHERE workspace_key = ? ORDER BY client_updated_at DESC LIMIT 100`,
        [context.workspace.key],
      )
      return rows.flatMap((row) => {
        try {
          const value = typeof row.project_data === 'string' ? JSON.parse(row.project_data) : row.project_data
          const parsed = projectSchema.safeParse(value)
          return parsed.success
            ? [{ ...parsed.data, ...(row.archived_at ? { archivedAt: Number(row.archived_at) } : {}) }]
            : []
        } catch {
          return []
        }
      })
    })

    logger.info('studio.projects.loaded', { workspaceType: context.workspace.type, projectCount: projects.length })
    return response(logger, { projects })
  } catch (error) {
    logger.error('studio.projects.load_failed', errorDetails(error))
    return response(logger, { error: { code: 'PROJECT_LOAD_FAILED', message: 'Projects could not be loaded.' } }, 500)
  }
}

export async function PATCH(request: Request) {
  const logger = requestLogger(request, '/api/projects')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: { code: 'AUTH_REQUIRED', message: 'Sign in to manage projects.' } }, 401)
    if (!isDatabaseConfigured()) return response(logger, { error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Cloud project sync is not configured yet.' } }, 503)

    const parsed = lifecycleSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return response(logger, { error: { code: 'INVALID_ACTION', message: 'Project action is invalid.' } }, 400)

    const archivedAt = parsed.data.action === 'archive' ? Date.now() : null
    const affected = await withTransaction(async (connection) => {
      await ensureWorkspaceRecord(connection, context)
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE lab_studio_projects SET archived_at = ?
         WHERE workspace_key = ? AND id = ?`,
        [archivedAt, context.workspace.key, parsed.data.id],
      )
      return result.affectedRows
    })
    if (!affected) return response(logger, { error: { code: 'PROJECT_NOT_FOUND', message: 'Project was not found in this workspace.' } }, 404)

    logger.info('studio.project.lifecycle_changed', {
      workspaceType: context.workspace.type,
      projectId: parsed.data.id,
      action: parsed.data.action,
    })
    return response(logger, { ok: true, archivedAt })
  } catch (error) {
    logger.error('studio.project.lifecycle_failed', errorDetails(error))
    return response(logger, { error: { code: 'PROJECT_ACTION_FAILED', message: 'The project could not be updated.' } }, 500)
  }
}

export async function PUT(request: Request) {
  const logger = requestLogger(request, '/api/projects')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(logger, { error: { code: 'AUTH_REQUIRED', message: 'Sign in to sync projects.' } }, 401)
    if (!isDatabaseConfigured()) return response(logger, { error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Cloud project sync is not configured yet.' } }, 503)

    const parsed = projectSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      logger.warn('studio.project.invalid', { issueCount: parsed.error.issues.length })
      return response(logger, { error: { code: 'INVALID_PROJECT', message: 'Project data is invalid or too large.' } }, 400)
    }

    const project = parsed.data
    await withTransaction(async (connection) => {
      await ensureWorkspaceRecord(connection, context)
      await connection.execute(
        `INSERT INTO lab_studio_projects
          (id, owner_id, workspace_key, name, project_data, client_updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = IF(VALUES(client_updated_at) >= client_updated_at, VALUES(name), name),
           project_data = IF(VALUES(client_updated_at) >= client_updated_at, VALUES(project_data), project_data),
           client_updated_at = GREATEST(client_updated_at, VALUES(client_updated_at))`,
        [project.id, context.userId, context.workspace.key, project.campaign.name, JSON.stringify(project), project.updatedAt],
      )
    })

    logger.info('studio.project.saved', { workspaceType: context.workspace.type, projectId: project.id })
    return response(logger, { ok: true, savedAt: new Date().toISOString() })
  } catch (error) {
    logger.error('studio.project.save_failed', errorDetails(error))
    return response(logger, { error: { code: 'PROJECT_SAVE_FAILED', message: 'This project could not be saved.' } }, 500)
  }
}
