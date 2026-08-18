import type { NextRequest } from 'next/server'
import { rateLimit, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isDocumentStoreConfigured, listGeneratedDocuments, readGeneratedDocument } from '@/lib/export/document-store'
import { isPostgresConfigured } from '@/lib/postgres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serves a document the assistant produced.
 *
 * The asset is read through the caller's own workspace, so an id belonging to
 * somebody else simply does not resolve — the lookup is scoped, not filtered
 * after the fact.
 */
export async function GET(request: NextRequest) {
  const log = requestLogger(request, '/api/documents')
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'documents', { minute: 60, daily: 600 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  if (!requester.context) {
    log.finish(401, { outcome: 'unauthenticated' })
    return Response.json({ error: 'Sign in to download this file.', requestId: log.requestId }, {
      status: 401, headers: log.headers(),
    })
  }

  if (request.nextUrl.searchParams.get('list') === '1') {
    if (!isPostgresConfigured() || !isDocumentStoreConfigured()) {
      log.finish(200, { outcome: 'list_not_configured' })
      return Response.json({ documents: [] }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }
    try {
      const documents = await listGeneratedDocuments(requester.context)
      log.finish(200, { outcome: 'list', count: documents.length })
      return Response.json({ documents }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    } catch (error) {
      log.error('documents.list_failed', errorDetails(error))
      log.finish(500, { outcome: 'list_error' })
      return Response.json({ error: 'Your documents could not be loaded.', requestId: log.requestId }, {
        status: 500, headers: log.headers(),
      })
    }
  }

  const assetId = request.nextUrl.searchParams.get('assetId') || ''
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(assetId)) {
    log.finish(400, { outcome: 'invalid_asset_id' })
    return Response.json({ error: 'Invalid file reference', requestId: log.requestId }, {
      status: 400, headers: log.headers(),
    })
  }

  try {
    const document = await readGeneratedDocument(requester.context, assetId)
    if (!document) {
      log.finish(404, { outcome: 'not_found' })
      return Response.json({ error: 'That file is no longer available.', requestId: log.requestId }, {
        status: 404, headers: log.headers(),
      })
    }
    log.finish(200, { outcome: 'success', bytes: document.byteSize })
    return new Response(document.bytes, {
      headers: log.headers({
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Cache-Control': 'private, no-store',
      }),
    })
  } catch (error) {
    log.error('documents.read_failed', errorDetails(error))
    log.finish(500, { outcome: 'read_error' })
    return Response.json({ error: 'That file could not be read.', requestId: log.requestId }, {
      status: 500, headers: log.headers(),
    })
  }
}
