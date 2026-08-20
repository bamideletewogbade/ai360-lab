import { getOptionalAuthContext } from '@/lib/auth'
import { rejectLargeRequest } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import {
  deleteBrandLogo, downloadBrandLogo, isBrandStorageConfigured, persistBrandLogo, readBrandLogoAssetId,
} from '@/lib/export/brand'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

/** A workspace's logo — one file, PNG or JPEG, embedded into generated PDF and Word documents in place of AI360's own mark. */

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/logo')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return json(log, { error: 'Sign in to manage your logo.' }, 401)
    const assetId = await readBrandLogoAssetId(context.workspace.key)
    if (!assetId) return json(log, { error: 'No logo has been set.' }, 404)
    const logo = await downloadBrandLogo(context.workspace.key, assetId)
    if (!logo) return json(log, { error: 'That logo is no longer available.' }, 404)
    log.finish(200, { outcome: 'served', assetId })
    return new Response(logo.bytes, {
      headers: log.headers({ 'Content-Type': logo.mimeType, 'Cache-Control': 'private, no-store' }),
    })
  } catch (error) {
    log.error('brand_kit.logo_read_failed', errorDetails(error))
    return json(log, { error: 'Your logo could not be loaded.' }, 500)
  }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/logo')
  try {
    const tooLarge = rejectLargeRequest(request, MAX_UPLOAD_BYTES + 200_000)
    if (tooLarge) { log.finish(tooLarge.status, { outcome: 'request_too_large' }); return tooLarge }
    const context = await getOptionalAuthContext()
    if (!context) return json(log, { error: 'Sign in to save a logo.' }, 401)
    if (!isBrandStorageConfigured()) return json(log, { error: 'Logo storage is not configured yet.' }, 503)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return json(log, { error: 'Attach an image file.' }, 400)
    if (file.size > MAX_UPLOAD_BYTES) return json(log, { error: 'Logos must be 3 MB or smaller.' }, 413)
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      return json(log, { error: 'Logos must be a PNG or JPEG image.' }, 415)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const { assetId } = await persistBrandLogo(context, { bytes, mimeType: file.type })
    log.finish(201, { outcome: 'saved', assetId })
    return Response.json({ ok: true }, { status: 201, headers: log.headers() })
  } catch (error) {
    log.error('brand_kit.logo_save_failed', errorDetails(error))
    return json(log, { error: error instanceof Error ? error.message : 'Your logo could not be saved.' }, 500)
  }
}

export async function DELETE(request: Request) {
  const log = requestLogger(request, '/api/brand-kit/logo')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return json(log, { error: 'Sign in to manage your logo.' }, 401)
    await deleteBrandLogo(context)
    log.finish(200, { outcome: 'cleared' })
    return Response.json({ ok: true }, { headers: log.headers() })
  } catch (error) {
    log.error('brand_kit.logo_delete_failed', errorDetails(error))
    return json(log, { error: 'Your logo could not be removed.' }, 500)
  }
}

function json(log: ReturnType<typeof requestLogger>, body: unknown, status: number) {
  log.finish(status, { outcome: status < 300 ? 'ok' : 'error' })
  return Response.json(body, { status, headers: log.headers() })
}
