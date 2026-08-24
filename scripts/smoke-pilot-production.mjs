import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { grantCredits } = await import('../src/lib/billing/credit-repository.ts')
const { deleteGeneratedMedia } = await import('../src/lib/media/storage.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')
const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
]

function cleanBaseUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Production pilot smoke tests require a credential-free HTTPS URL.')
  }
  return url.origin
}

function pass(message, detail = '') {
  console.log(`PASS  ${message}${detail ? `  (${detail})` : ''}`)
}

async function jsonResponse(response, expectedStatus, label) {
  const body = await response.json().catch(() => null)
  if (response.status !== expectedStatus) {
    throw new Error(`${label} returned HTTP ${response.status}: ${JSON.stringify(body)?.slice(0, 300)}`)
  }
  return body
}

function streamEvents(body) {
  return body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

async function authenticatedCookie(email, password) {
  const jar = new Map()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) => {
          for (const { name, value, options } of values) {
            if (options?.maxAge === 0) jar.delete(name)
            else jar.set(name, value)
          }
        },
      },
    },
  )
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Synthetic pilot sign-in failed: ${error?.message || 'no user'}`)
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

function projectFixture(id) {
  const now = Date.now()
  return {
    id,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 2,
    intake: {
      businessName: 'AI360 Pilot E2E',
      industry: 'Product testing',
      offer: 'A temporary production verification project.',
      audience: 'AI360 pilot testers',
      goal: 'Verify project sync and deletion',
      location: 'Accra',
      channels: [],
      notes: 'Synthetic test data. Safe to remove after this run.',
    },
    brand: {
      summary: 'Synthetic E2E fixture',
      audience: 'Pilot testers',
      personality: [],
      voice: '',
      colors: [],
      tagline: '',
      valueProposition: '',
    },
    campaign: {
      name: 'AI360 Pilot E2E',
      objective: 'Verify the production project lifecycle.',
      bigIdea: 'One isolated project exercises save, archive, restore and delete.',
      callToAction: '',
      channels: [],
      successMeasures: [],
    },
    assets: [],
  }
}

async function main() {
  const baseUrl = cleanBaseUrl(process.argv[2] || '')
  if (!process.argv.includes('--confirm-production')) {
    throw new Error('Refusing to create a temporary production account without --confirm-production.')
  }
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim())
  if (missing.length) throw new Error(`Pilot smoke environment is missing: ${missing.join(', ')}`)

  const runId = randomUUID()
  const email = `pilot-e2e-${runId}@example.invalid`
  const password = `${randomBytes(24).toString('base64url')}aA1!`
  const projectId = `pilot-e2e-${runId}`
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const sql = getPostgres()
  let userId = ''
  let mediaJobId = ''
  let workspaceContext = null
  let primaryError = null

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'AI360 Pilot E2E' },
    })
    if (created.error || !created.data.user) {
      throw new Error(`Synthetic pilot account creation failed: ${created.error?.message || 'no user'}`)
    }
    userId = created.data.user.id
    pass('temporary pilot identity created')

    const cookie = await authenticatedCookie(email, password)
    const headers = {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'User-Agent': 'AI360-Pilot-Smoke/1.0',
      'X-Request-Id': `pilot-smoke-${runId}`,
    }
    const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(120_000),
      headers: { ...headers, ...(options.headers || {}) },
    })

    const before = await jsonResponse(await request('/api/credits'), 200, 'Initial credit read')
    if (!Number.isFinite(before.available)) throw new Error('Initial credit response had no available balance.')
    pass('authenticated credit balance loads', `${before.available} available`)

    const context = createWorkspaceAuthContext({ userId, email, displayName: 'AI360 Pilot E2E' })
    workspaceContext = context
    const grant = await grantCredits({
      context,
      credits: 100,
      sourceType: 'sponsored_seat',
      sourceId: 'production-pilot-e2e',
      idempotencyKey: `production-pilot-e2e:${runId}`,
    })
    if (!grant.granted) throw new Error(`Sponsored credit grant failed: ${grant.reason || 'unknown'}`)
    const after = await jsonResponse(await request('/api/credits'), 200, 'Sponsored credit read')
    if (after.available !== before.available + 100) {
      throw new Error(`Sponsored balance mismatch: expected ${before.available + 100}, received ${after.available}`)
    }
    pass('100 sponsored credits reach the signed-in account', `${before.available} -> ${after.available}`)

    const checkout = await jsonResponse(await request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': `pilot-smoke-checkout-${runId}` },
      body: JSON.stringify({ plan: 'everyday', cadence: 'monthly', paymentMethod: 'mobile_money' }),
    }), 503, 'Disabled checkout')
    if (checkout.status !== 'payments_closed') throw new Error('Checkout did not return payments_closed.')
    pass('ExpressPay checkout stays closed for an authenticated pilot user')

    const chatResponse = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with exactly: PILOT AUTH CHAT OK' }],
        mode: 'auto',
        language: 'en',
        sessionId: `pilot-smoke-chat-${runId}`,
      }),
    })
    const chatBody = await chatResponse.text()
    if (!chatResponse.ok) throw new Error(`Authenticated chat returned HTTP ${chatResponse.status}: ${chatBody.slice(0, 300)}`)
    const events = streamEvents(chatBody)
    const renderedText = events
      .filter((event) => event.type === 'text' || event.type === 'delta')
      .map((event) => event.content || event.text || event.delta || '')
      .join('')
    if (!events.some((event) => event.type === 'done')) throw new Error('Authenticated chat stream had no done event.')
    if (!renderedText.includes('PILOT AUTH CHAT OK') && !chatBody.includes('PILOT AUTH CHAT OK')) {
      throw new Error('Authenticated chat did not return the expected response.')
    }
    pass('authenticated production chat streams to completion')

    const project = projectFixture(projectId)
    await jsonResponse(await request('/api/projects', {
      method: 'PUT',
      body: JSON.stringify(project),
    }), 200, 'Project save')
    const saved = await jsonResponse(await request('/api/projects'), 200, 'Project load')
    if (!saved.projects?.some((item) => item.id === projectId)) throw new Error('Saved project was not returned.')
    pass('project saves and syncs back to the pilot account')

    const archived = await jsonResponse(await request('/api/projects', {
      method: 'PATCH',
      body: JSON.stringify({ id: projectId, action: 'archive' }),
    }), 200, 'Project archive')
    if (!Number.isFinite(archived.archivedAt)) throw new Error('Project archive returned no timestamp.')
    await jsonResponse(await request('/api/projects', {
      method: 'PATCH',
      body: JSON.stringify({ id: projectId, action: 'restore' }),
    }), 200, 'Project restore')
    pass('project archives and restores')

    await jsonResponse(await request('/api/projects', {
      method: 'DELETE',
      body: JSON.stringify({ id: projectId }),
    }), 200, 'Project delete')
    const removed = await jsonResponse(await request('/api/projects'), 200, 'Deleted project load')
    if (removed.projects?.some((item) => item.id === projectId)) throw new Error('Deleted project was still returned.')
    pass('project deletes cleanly without returning')

    const image = await jsonResponse(await request('/api/studio/image', {
      method: 'POST',
      headers: { 'Idempotency-Key': `pilot-smoke-image-${runId}` },
      body: JSON.stringify({
        approved: true,
        prompt: 'A simple abstract sunrise over Accra in warm gold and deep charcoal, clean geometric shapes, no text.',
        style: 'Minimal editorial illustration',
        kind: 'social',
      }),
    }), 200, 'Image generation')
    if (!image.jobId || !image.assetId) throw new Error('Generated image was not stored as durable pilot media.')
    mediaJobId = image.jobId

    const mediaDownload = await request(`/api/studio/media?assetId=${encodeURIComponent(image.assetId)}`)
    const mediaBytes = Buffer.from(await mediaDownload.arrayBuffer())
    const mediaType = mediaDownload.headers.get('content-type') || ''
    if (!mediaDownload.ok || !mediaType.startsWith('image/') || mediaBytes.length < 1_024) {
      throw new Error(`Generated media download was invalid: HTTP ${mediaDownload.status}, ${mediaType}, ${mediaBytes.length} bytes`)
    }
    const recentMedia = await jsonResponse(await request('/api/studio/media?recent=1'), 200, 'Recent media')
    if (!recentMedia.jobs?.some((job) => job.id === mediaJobId && job.outputAssetId === image.assetId)) {
      throw new Error('Generated image did not appear in the Media Studio gallery feed.')
    }
    const afterImage = await jsonResponse(await request('/api/credits'), 200, 'Post-image credit read')
    if (!(afterImage.available < after.available && afterImage.available >= after.available - 6)) {
      throw new Error(`Image credit charge was outside the published range: ${after.available} -> ${afterImage.available}`)
    }
    pass('Media Studio generates, stores and charges for a real image', `${mediaBytes.length} bytes, ${after.available} -> ${afterImage.available} credits`)

    await jsonResponse(await request('/api/studio/media', {
      method: 'DELETE',
      body: JSON.stringify({ jobId: mediaJobId }),
    }), 200, 'Media delete')
    const afterMediaDelete = await jsonResponse(await request('/api/studio/media?recent=1'), 200, 'Deleted media list')
    if (afterMediaDelete.jobs?.some((job) => job.id === mediaJobId)) {
      throw new Error('Deleted media was still returned by the gallery feed.')
    }
    mediaJobId = ''
    pass('generated media deletes cleanly from the pilot account')

    const [ledger] = await sql`
      select credits_delta from public.lab_credit_ledger
       where workspace_key = ${`user:${userId}`}
         and source_type = 'sponsored_seat'
         and source_id = 'production-pilot-e2e'`
    if (Number(ledger?.credits_delta) !== 100) throw new Error('Sponsored grant was missing from the production ledger.')
    pass('sponsored grant is auditable in the production ledger')
  } catch (error) {
    primaryError = error
  } finally {
    if (userId) {
      try {
        if (mediaJobId && workspaceContext) {
          await deleteGeneratedMedia(workspaceContext, mediaJobId)
          mediaJobId = ''
        }
        await sql`delete from public.lab_usage_events where owner_id = ${userId}`
        await sql`delete from public.lab_workspaces where workspace_key = ${`user:${userId}`}`
        await sql`delete from public.lab_users where clerk_user_id = ${userId}`
        const deleted = await admin.auth.admin.deleteUser(userId)
        if (deleted.error) throw deleted.error
        pass('temporary pilot identity and application data removed')
      } catch (cleanupError) {
        console.error(`CLEANUP FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
        if (!primaryError) primaryError = cleanupError
      }
    }
    await sql.end({ timeout: 5 })
  }

  if (primaryError) throw primaryError
  console.log('\nProduction pilot E2E passed.')
}

try {
  await main()
} catch (error) {
  console.error(`\nFAIL  ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
