import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import {
  isExportFormat, NoTabularContentError, renderDocument,
} from '@/lib/export/render'
import { resolveDocumentBrand } from '@/lib/export/brand'

export const runtime = 'nodejs'

/**
 * Documents a person asked for by name.
 *
 * The rendering itself lives in `@/lib/export/render`, shared with the assistant
 * tool that produces documents on its own initiative — one generation path, so
 * the two can never drift apart.
 */
export async function POST(request: Request) {
  const log = requestLogger(request, '/api/export')
  const startedAt = performance.now()
  const tooLarge = rejectLargeRequest(request, 250_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'export', { minute: 15, daily: 80 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: { title?: string; content?: string; format?: string; projectId?: unknown }
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid request', requestId: log.requestId }, {
      status: 400, headers: log.headers(),
    })
  }

  const content = typeof body.content === 'string' ? body.content.slice(0, 100_000) : ''
  if (!content) {
    log.finish(400, { outcome: 'missing_content' })
    return Response.json({ error: 'Nothing to export', requestId: log.requestId }, {
      status: 400, headers: log.headers(),
    })
  }
  if (!isExportFormat(body.format)) {
    log.finish(400, { outcome: 'unsupported_format', format: body.format })
    return Response.json({ error: 'Unsupported format', requestId: log.requestId }, {
      status: 400, headers: log.headers(),
    })
  }
  const format = body.format
  const projectId = typeof body.projectId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.projectId)
    ? body.projectId
    : null

  try {
    log.info('export.started', { format, inputCharacters: content.length })
    const brand = requester.context
      ? await resolveDocumentBrand({ workspaceKey: requester.context.workspace.key, projectId }).catch(() => undefined)
      : undefined
    const document = await renderDocument({ title: body.title || 'AI360 response', content, format, brand })
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/export', feature: `export.${format}`,
      latencyMs: Math.round(performance.now() - startedAt), outcome: 'success',
      metadata: {
        inputCharacters: content.length,
        outputBytes: document.bytes.byteLength,
        ...(document.sheetCount ? { sheetCount: document.sheetCount } : {}),
      },
    })
    log.finish(200, { outcome: 'success', format, outputBytes: document.bytes.byteLength })
    return new Response(new Uint8Array(document.bytes), {
      headers: log.headers({
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Cache-Control': 'no-store',
      }),
    })
  } catch (error) {
    if (error instanceof NoTabularContentError) {
      log.finish(422, { outcome: 'no_tabular_content' })
      return Response.json({
        error: 'There is no table in this content to put in a spreadsheet. Ask for the information as a table, then export it.',
        requestId: log.requestId,
      }, { status: 422, headers: log.headers() })
    }
    log.error('export.failed', { format, ...errorDetails(error) })
    log.finish(500, { outcome: 'generation_error', format })
    return Response.json({
      error: 'The document could not be created', requestId: log.requestId,
    }, { status: 500, headers: log.headers() })
  }
}
