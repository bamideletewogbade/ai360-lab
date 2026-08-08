import { checkPostgresConnection } from '@/lib/postgres'
import { productionReadiness, selectedDatabaseProvider } from '@/lib/runtime-config'
import { errorDetails, requestLogger } from '@/lib/observability'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/ready')
  const readiness = productionReadiness()
  const databaseProvider = selectedDatabaseProvider()
  let databaseConnection: 'connected' | 'unavailable' | 'not_configured' = 'not_configured'

  try {
    if (databaseProvider === 'postgres') {
      await checkPostgresConnection()
      databaseConnection = 'connected'
    }
  } catch (error) {
    databaseConnection = 'unavailable'
    log.error('readiness.database_unavailable', { databaseProvider, ...errorDetails(error) })
  }

  const ready = readiness.ready && databaseConnection === 'connected'
  const status = ready ? 200 : 503
  log.finish(status, { outcome: ready ? 'ready' : 'not_ready', databaseProvider, databaseConnection })

  return Response.json({
    status: ready ? 'ready' : 'not_ready',
    service: 'AI360 Lab',
    databaseProvider,
    databaseConnection,
    checks: readiness.checks,
    requestId: log.requestId,
    time: new Date().toISOString(),
  }, {
    status,
    headers: log.headers({ 'Cache-Control': 'no-store' }),
  })
}
