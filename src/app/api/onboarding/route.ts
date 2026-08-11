import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { readWorkspaceOnboarding, writeWorkspaceOnboarding } from '@/lib/onboarding-store'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const writeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    role: z.enum(['student', 'professional', 'entrepreneur', 'organization']),
    goal: z.enum(['learn', 'write', 'research', 'business']),
  }),
  z.object({ status: z.literal('skipped') }),
])

function unavailable(status: number, code: string, message: string, headers: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/onboarding')
  const context = await getOptionalAuthContext()
  if (!context) {
    log.finish(401, { outcome: 'auth_required' })
    return unavailable(401, 'AUTH_REQUIRED', 'Sign in to load your workspace.', log.headers())
  }
  if (!isPostgresConfigured()) {
    log.finish(503, { outcome: 'database_not_configured' })
    return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Personalization sync is not configured yet.', log.headers())
  }

  try {
    const state = await readWorkspaceOnboarding(context)
    log.finish(200, { outcome: 'success', status: state?.status })
    return NextResponse.json(state ?? { status: 'none' }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('onboarding.read_failed', errorDetails(error))
    log.finish(500, { outcome: 'read_failed' })
    return unavailable(500, 'READ_FAILED', 'Your personalization could not be loaded.', log.headers())
  }
}

export async function PUT(request: Request) {
  const log = requestLogger(request, '/api/onboarding')
  const context = await getOptionalAuthContext()
  if (!context) {
    log.finish(401, { outcome: 'auth_required' })
    return unavailable(401, 'AUTH_REQUIRED', 'Sign in to save your personalization.', log.headers())
  }
  if (!isPostgresConfigured()) {
    log.finish(503, { outcome: 'database_not_configured' })
    return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Personalization sync is not configured yet.', log.headers())
  }

  const parsed = writeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    log.finish(400, { outcome: 'invalid_onboarding' })
    return unavailable(400, 'INVALID_ONBOARDING', 'The personalization data is invalid.', log.headers())
  }

  try {
    const input = parsed.data.status === 'completed'
      ? { status: 'completed' as const, profile: { role: parsed.data.role, goal: parsed.data.goal } }
      : { status: 'skipped' as const }
    await writeWorkspaceOnboarding(context, input)
    log.finish(200, { outcome: 'saved', status: parsed.data.status })
    return NextResponse.json({ ok: true }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('onboarding.write_failed', errorDetails(error))
    log.finish(500, { outcome: 'write_failed' })
    return unavailable(500, 'WRITE_FAILED', 'Your personalization could not be saved.', log.headers())
  }
}
