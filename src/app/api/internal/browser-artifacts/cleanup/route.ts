import { timingSafeEqual } from 'node:crypto'
import { removeBrowserArtifacts } from '@/lib/browser/artifact-storage'
import { expiredBrowserArtifacts, markBrowserArtifactsDeleted } from '@/lib/browser/store'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: Request) {
  const configured = process.env.AI360_BROWSER_CLEANUP_SECRET || process.env.CRON_SECRET || ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!configured || configured.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/internal/browser-artifacts/cleanup')
  if (!authorized(request)) {
    log.finish(401, { outcome: 'unauthorized' })
    return Response.json({ error: 'Not authorized.' }, { status: 401, headers: log.headers() })
  }
  try {
    const expired = await expiredBrowserArtifacts(500)
    const paths = expired.map((artifact) => artifact.objectPath)
    await removeBrowserArtifacts(paths)
    await markBrowserArtifactsDeleted(paths)
    log.finish(200, { outcome: 'complete', deleted: paths.length })
    return Response.json({ deleted: paths.length }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('browser.artifact_cleanup_failed', errorDetails(error))
    log.finish(500, { outcome: 'cleanup_failed' })
    return Response.json({ error: 'Evidence cleanup failed.' }, { status: 500, headers: log.headers() })
  }
}
