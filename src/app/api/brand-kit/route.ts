import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { deleteBrandKit, isDocumentBrandKitConfigured, readBrandKit, writeBrandKit } from '@/lib/export/brand'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A workspace's saved document colours.
 *
 * One row, read on Settings load and applied automatically to every document
 * a workspace generates from then on — see `@/lib/export/brand` for how a
 * document actually picks it up. Nothing here is customer-visible content, so
 * unlike a project or a conversation this never needs to be listed, only read
 * and replaced.
 */

const brandSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Enter a 6-digit hex colour, like #101112.'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Enter a 6-digit hex colour, like #101112.'),
})

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/brand-kit')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(log, { error: 'Sign in to manage your brand kit.' }, 401)
    if (!isDocumentBrandKitConfigured()) return response(log, { brand: null }, 200)
    const brand = await readBrandKit(context.workspace.key)
    log.finish(200, { outcome: brand ? 'set' : 'unset' })
    return Response.json({ brand }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('brand_kit.read_failed', errorDetails(error))
    return response(log, { error: 'Your brand kit could not be loaded.' }, 500)
  }
}

export async function PUT(request: Request) {
  const log = requestLogger(request, '/api/brand-kit')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(log, { error: 'Sign in to save a brand kit.' }, 401)
    if (!isDocumentBrandKitConfigured()) return response(log, { error: 'Brand kits are not configured yet.' }, 503)

    const parsed = brandSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return response(log, { error: parsed.error.issues[0]?.message || 'Invalid colours.' }, 400)
    }
    await writeBrandKit(context, parsed.data)
    log.finish(200, { outcome: 'saved' })
    return Response.json({ brand: parsed.data }, { headers: log.headers() })
  } catch (error) {
    log.error('brand_kit.save_failed', errorDetails(error))
    return response(log, { error: 'Your brand kit could not be saved.' }, 500)
  }
}

export async function DELETE(request: Request) {
  const log = requestLogger(request, '/api/brand-kit')
  try {
    const context = await getOptionalAuthContext()
    if (!context) return response(log, { error: 'Sign in to manage your brand kit.' }, 401)
    if (isDocumentBrandKitConfigured()) await deleteBrandKit(context)
    log.finish(200, { outcome: 'cleared' })
    return Response.json({ ok: true }, { headers: log.headers() })
  } catch (error) {
    log.error('brand_kit.delete_failed', errorDetails(error))
    return response(log, { error: 'Your brand kit could not be cleared.' }, 500)
  }
}

function response(log: ReturnType<typeof requestLogger>, body: unknown, status: number) {
  log.finish(status, { outcome: status === 200 ? 'ok' : 'error' })
  return Response.json(body, { status, headers: log.headers() })
}
