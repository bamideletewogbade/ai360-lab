import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { rejectLargeRequest } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { addBrandKnowledgeFile, deleteBrandKnowledgeFile, listBrandKnowledgeFiles } from '@/lib/brand-knowledge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A workspace's knowledge base — the same contract as project files
 * (`@/app/api/projects/[projectId]/files/route.ts`), one level up. Kept
 * identical on purpose: text-bearing types only, same size cap, same
 * "PDF and Word support is next" honesty, so the two upload surfaces behave
 * exactly the same way and a fix to one is a fix people expect on the other.
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024
const TEXT_TYPE = /^(text\/|application\/(json|csv|xml|markdown|x-yaml|x-ndjson))/i
const TEXT_EXTENSION = /\.(txt|md|markdown|mdx|csv|tsv|json|log|ya?ml|xml|html?|rtf)$/i

async function requireAuth(log: ReturnType<typeof requestLogger>) {
  const context = await getOptionalAuthContext()
  if (!context) {
    return { context: null, denied: Response.json({ error: 'Sign in to manage your brand knowledge.' }, { status: 401, headers: log.headers() }) }
  }
  if (!isPostgresConfigured()) {
    return { context: null, denied: Response.json({ error: 'Brand knowledge is not configured yet.' }, { status: 503, headers: log.headers() }) }
  }
  return { context, denied: null }
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/knowledge')
  try {
    const { context, denied } = await requireAuth(log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }
    const files = await listBrandKnowledgeFiles(context)
    log.finish(200, { outcome: 'listed', fileCount: files.length })
    return Response.json({ files }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('brand_knowledge.list_failed', errorDetails(error))
    log.finish(500, { outcome: 'list_failed' })
    return Response.json({ error: 'Files could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/knowledge')
  try {
    const tooLarge = rejectLargeRequest(request, MAX_FILE_BYTES + 200_000)
    if (tooLarge) { log.finish(tooLarge.status, { outcome: 'request_too_large' }); return tooLarge }
    const { context, denied } = await requireAuth(log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      log.finish(400, { outcome: 'no_file' })
      return Response.json({ error: 'Attach a file to add.' }, { status: 400, headers: log.headers() })
    }
    if (file.size > MAX_FILE_BYTES) {
      log.finish(413, { outcome: 'file_too_large' })
      return Response.json({ error: 'Each file must be 2 MB or smaller.' }, { status: 413, headers: log.headers() })
    }
    const readable = TEXT_TYPE.test(file.type) || TEXT_EXTENSION.test(file.name)
    if (!readable) {
      log.finish(415, { outcome: 'unsupported_type', mimeType: file.type })
      return Response.json({ error: 'Add text, Markdown, CSV or JSON for now. PDF and Word support is coming next.' }, { status: 415, headers: log.headers() })
    }
    const text = (await file.text()).trim()
    if (!text) {
      log.finish(400, { outcome: 'empty_file' })
      return Response.json({ error: 'That file has no readable text.' }, { status: 400, headers: log.headers() })
    }

    const saved = await addBrandKnowledgeFile(context, {
      name: file.name || 'Untitled',
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      extractedText: text,
    })
    log.finish(201, { outcome: 'added', fileId: saved.id, charCount: saved.charCount })
    return Response.json({ file: saved }, { status: 201, headers: log.headers() })
  } catch (error) {
    log.error('brand_knowledge.add_failed', errorDetails(error))
    log.finish(500, { outcome: 'add_failed' })
    return Response.json({ error: 'The file could not be added.' }, { status: 500, headers: log.headers() })
  }
}

export async function DELETE(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/knowledge')
  try {
    const { context, denied } = await requireAuth(log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }
    const fileId = new URL(request.url).searchParams.get('fileId')
    if (!fileId) {
      log.finish(400, { outcome: 'no_file_id' })
      return Response.json({ error: 'Which file should be removed?' }, { status: 400, headers: log.headers() })
    }
    const removed = await deleteBrandKnowledgeFile(context, fileId)
    log.finish(removed ? 200 : 404, { outcome: removed ? 'deleted' : 'not_found', fileId })
    return Response.json({ ok: removed }, { status: removed ? 200 : 404, headers: log.headers() })
  } catch (error) {
    log.error('brand_knowledge.delete_failed', errorDetails(error))
    log.finish(500, { outcome: 'delete_failed' })
    return Response.json({ error: 'The file could not be removed.' }, { status: 500, headers: log.headers() })
  }
}
