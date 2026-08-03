import { isAuthConfigured } from '@/lib/auth'
import { getMySqlPool, isDatabaseConfigured } from '@/lib/mysql'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id')?.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)
    || crypto.randomUUID()
  const databaseConfigured = isDatabaseConfigured()
  let databaseStatus: 'not_configured' | 'connected' | 'unavailable' = 'not_configured'
  if (databaseConfigured) {
    try {
      await getMySqlPool().query('SELECT 1')
      databaseStatus = 'connected'
    } catch {
      databaseStatus = 'unavailable'
    }
  }
  return Response.json(
    {
      status: 'ok',
      service: 'AI 360 Lab',
      aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      authConfigured: isAuthConfigured(),
      clerkWebhookConfigured: Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET),
      databaseConfigured,
      databaseStatus,
      usageLedgerConfigured: databaseConfigured,
      environment: process.env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      requestId,
      time: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  )
}
