import { getOptionalAuthContext } from '@/lib/auth'
import { isPostgresConfigured } from '@/lib/postgres'
import { rejectLargeRequest } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { addProjectFile, deleteProjectFile, listProjectFiles } from '@/lib/studio/project-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 2 * 1024 * 1024
// Text-bearing types this first slice can read server-side. PDF and Word are a
// deliberate fast-follow, so they are refused with a clear message rather than
// stored as empty knowledge that silently grounds nothing.
const TEXT_TYPE = /^(text\/|application\/(json|csv|xml|markdown|x-yaml|x-ndjson))/i
const TEXT_EXTENSION = /\.(txt|md|markdown|mdx|csv|tsv|json|log|ya?ml|xml|html?|rtf)$/i

type RouteContext = { params: Promise<{ projectId: string }> }

async function requireAuth(request: Request, log: ReturnType<typeof requestLogger>) {
  const context = await getOptionalAuthContext()
  if (!context) {
    return { context: null, denied: Response.json({ error: 'Sign in to manage project files.' }, { status: 401, headers: log.headers() }) }
  }
  if (!isPostgresConfigured()) {
    return { context: null, denied: Response.json({ error: 'Project knowledge is not configured yet.' }, { status: 503, headers: log.headers() }) }
  }
  return { context, denied: null }
}

export async function GET(request: Request, { params }: RouteContext) {
  const log = requestLogger(request, '/api/projects/files')
  const { projectId } = await params
  try {
    const { context, denied } = await requireAuth(request, log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }
    const files = await listProjectFiles(context, projectId)
    log.finish(200, { outcome: 'listed', projectId, fileCount: files.length })
    return Response.json({ files }, { headers: log.headers() })
  } catch (error) {
    log.error('project.files.list_failed', errorDetails(error))
    log.finish(500, { outcome: 'list_failed' })
    return Response.json({ error: 'Files could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const log = requestLogger(request, '/api/projects/files')
  const { projectId } = await params
  try {
    const tooLarge = rejectLargeRequest(request, MAX_FILE_BYTES + 200_000)
    if (tooLarge) { log.finish(tooLarge.status, { outcome: 'request_too_large' }); return tooLarge }
    const { context, denied } = await requireAuth(request, log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      log.finish(400, { outcome: 'no_file' })
      return Response.json({ error: 'Attach a file to add to this project.' }, { status: 400, headers: log.headers() })
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

    const saved = await addProjectFile(context, {
      projectId,
      name: file.name || 'Untitled',
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      extractedText: text,
    })
    log.finish(201, { outcome: 'added', projectId, fileId: saved.id, charCount: saved.charCount })
    return Response.json({ file: saved }, { status: 201, headers: log.headers() })
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      log.finish(404, { outcome: 'project_not_found', projectId })
      return Response.json({ error: 'That project was not found in your workspace.' }, { status: 404, headers: log.headers() })
    }
    log.error('project.files.add_failed', errorDetails(error))
    log.finish(500, { outcome: 'add_failed' })
    return Response.json({ error: 'The file could not be added.' }, { status: 500, headers: log.headers() })
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const log = requestLogger(request, '/api/projects/files')
  const { projectId } = await params
  try {
    const { context, denied } = await requireAuth(request, log)
    if (denied) { log.finish(denied.status, { outcome: 'auth_required' }); return denied }
    const fileId = new URL(request.url).searchParams.get('fileId')
    if (!fileId) {
      log.finish(400, { outcome: 'no_file_id' })
      return Response.json({ error: 'Which file should be removed?' }, { status: 400, headers: log.headers() })
    }
    const removed = await deleteProjectFile(context, projectId, fileId)
    log.finish(removed ? 200 : 404, { outcome: removed ? 'deleted' : 'not_found', projectId, fileId })
    return Response.json({ ok: removed }, { status: removed ? 200 : 404, headers: log.headers() })
  } catch (error) {
    log.error('project.files.delete_failed', errorDetails(error))
    log.finish(500, { outcome: 'delete_failed' })
    return Response.json({ error: 'The file could not be removed.' }, { status: 500, headers: log.headers() })
  }
}
