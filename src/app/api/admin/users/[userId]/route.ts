import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'
import { readAdminUserDetail } from '@/lib/admin/repository'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const log = requestLogger(request, '/api/admin/users/[userId]')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to inspect users.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    const { userId } = await context.params
    if (!/^[A-Za-z0-9._:-]{2,160}$/.test(userId)) return Response.json({ error: 'Invalid user identifier.' }, { status: 400, headers: log.headers() })
    const detail = await readAdminUserDetail(userId)
    if (!detail) return Response.json({ error: 'User not found.' }, { status: 404, headers: log.headers() })
    log.finish(200, { outcome: 'success' })
    return Response.json(detail, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.user_detail_failed', errorDetails(error))
    log.finish(500, { outcome: 'detail_failed' })
    return Response.json({ error: 'The user record could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
