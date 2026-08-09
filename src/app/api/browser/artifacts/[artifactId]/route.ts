import { getOptionalAuthContext } from '@/lib/auth'
import { downloadBrowserArtifact } from '@/lib/browser/artifact-storage'
import { loadBrowserArtifact } from '@/lib/browser/store'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const log = requestLogger(request, '/api/browser/artifacts/[artifactId]')
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'action', { minute: 30, daily: 300 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  const context = await getOptionalAuthContext()
  if (!context) return Response.json({ error: 'Sign in to view this evidence.' }, { status: 401, headers: log.headers() })

  const { artifactId } = await params
  const artifact = await loadBrowserArtifact(context.workspace.key, artifactId.slice(0, 120))
  if (!artifact) return Response.json({ error: 'That evidence is not in this workspace.' }, { status: 404, headers: log.headers() })
  if (artifact.deletedAt || new Date(artifact.expiresAt).getTime() <= Date.now()) {
    return Response.json({ error: 'This browser evidence has expired.' }, { status: 410, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  }

  try {
    const bytes = await downloadBrowserArtifact(artifact.objectPath)
    log.finish(200, { outcome: 'artifact_served', artifactId: artifact.id })
    return new Response(bytes, {
      headers: log.headers({
        'Content-Type': artifact.mimeType,
        'Content-Length': String(artifact.byteLength),
        'Cache-Control': 'private, max-age=60, no-transform',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `inline; filename="${artifact.id}.jpg"`,
      }),
    })
  } catch (error) {
    log.error('browser.artifact_download_failed', errorDetails(error))
    log.finish(502, { outcome: 'artifact_unavailable', artifactId: artifact.id })
    return Response.json({ error: 'This evidence is temporarily unavailable.' }, { status: 502, headers: log.headers() })
  }
}
