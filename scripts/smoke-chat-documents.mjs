import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const CASES = [
  {
    format: 'pdf',
    mime: 'application/pdf',
    magic: '25504446',
    prompt: 'Create a PDF file titled AI360 Production PDF Smoke Check. Include a heading, today\'s test label, and three short checklist items.',
  },
  {
    format: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: '504b0304',
    prompt: 'Create an editable Word DOCX document titled AI360 Production Word Smoke Check. Include a heading and three short numbered verification steps.',
  },
  {
    format: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: '504b0304',
    prompt: 'Create an Excel XLSX spreadsheet titled AI360 Production Excel Smoke Check from this table: | Item | Quantity | Status |\n| PDF | 1 | Ready |\n| DOCX | 1 | Ready |\n| XLSX | 1 | Ready |',
  },
  {
    format: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    magic: '504b0304',
    prompt: 'Create a PowerPoint PPTX presentation titled AI360 Production PowerPoint Smoke Check with a heading and three short bullet points.',
  },
]

function cleanBaseUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Smoke-test URL must be HTTP or HTTPS without credentials.')
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Remote document smoke tests require HTTPS.')
  }
  return url.origin
}

function eventsFrom(body) {
  return body.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))
}

/** @type {(asset: { assetId: string }) => void} */
const ignoreAsset = () => undefined

/** Exercises the same chat and private-download routes a signed-in person uses. */
export async function runDocumentChatSmoke(baseUrl, cookie, request = fetch, onAsset = ignoreAsset) {
  if (!cookie?.trim()) throw new Error('An authenticated smoke-test cookie is required.')
  const base = cleanBaseUrl(baseUrl)
  const assets = []

  for (const item of CASES) {
    const requestId = `document-smoke-${item.format}-${Date.now()}`
    const chat = await request(`${base}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'User-Agent': 'AI360-Document-Smoke/1.0',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: item.prompt }],
        mode: 'auto',
        language: 'en',
        sessionId: requestId,
      }),
    })
    const body = await chat.text()
    if (!chat.ok) throw new Error(`${item.format} chat failed with HTTP ${chat.status}: ${body.slice(0, 300)}`)
    const events = eventsFrom(body)
    const attachment = events.find((event) => event.type === 'attachment' && event.format === item.format)
    if (attachment?.assetId) {
      assets.push(attachment)
      onAsset(attachment)
    }
    const streamError = events.find((event) => event.type === 'error')
    if (streamError) throw new Error(`${item.format} chat stream failed: ${streamError.message || streamError.code}`)
    if (!events.some((event) => event.type === 'done')) throw new Error(`${item.format} chat stream ended without done.`)
    if (!attachment?.assetId) throw new Error(`${item.format} chat produced no ${item.format} attachment.`)
    const download = await request(`${base}/api/documents?assetId=${encodeURIComponent(attachment.assetId)}`, {
      signal: AbortSignal.timeout(30_000),
      headers: { Cookie: cookie, 'User-Agent': 'AI360-Document-Smoke/1.0', 'X-Request-Id': `${requestId}-download` },
    })
    const bytes = Buffer.from(await download.arrayBuffer())
    const mime = (download.headers.get('content-type') || '').split(';')[0].trim()
    const magic = bytes.subarray(0, 4).toString('hex')
    const disposition = download.headers.get('content-disposition') || ''
    if (!download.ok) throw new Error(`${item.format} download failed with HTTP ${download.status}.`)
    if (mime !== item.mime) throw new Error(`${item.format} download had MIME ${mime || 'missing'}.`)
    if (magic !== item.magic) throw new Error(`${item.format} download had invalid magic bytes ${magic}.`)
    if (!new RegExp(`\\.${item.format}\\b`, 'i').test(disposition)) {
      throw new Error(`${item.format} download did not use a .${item.format} filename.`)
    }
    if (bytes.length < 500) throw new Error(`${item.format} download was unexpectedly small (${bytes.length} bytes).`)
    console.log(`PASS  ${item.format.toUpperCase()} chat attachment downloads and opens structurally (${bytes.length} bytes)`)
  }

  return assets
}

async function signInForSmoke(environment) {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'AI360_SMOKE_EMAIL', 'AI360_SMOKE_PASSWORD',
  ]
  const missing = required.filter((name) => !environment[name]?.trim())
  if (missing.length) throw new Error(`Document smoke authentication is missing: ${missing.join(', ')}`)

  const jar = new Map()
  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL.trim(),
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim(),
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email: environment.AI360_SMOKE_EMAIL.trim(),
    password: environment.AI360_SMOKE_PASSWORD,
  })
  if (error || !data.user) throw new Error(`Document smoke sign-in failed: ${error?.message || 'no user returned'}`)
  return {
    userId: data.user.id,
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
  }
}

/** Removes only the exact assets created by this run. */
async function cleanupSmokeAssets(environment, userId, assetIds) {
  if (!assetIds.length) return
  const required = ['DATABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PRIVATE_BUCKET']
  const missing = required.filter((name) => !environment[name]?.trim())
  if (missing.length) throw new Error(`Document smoke cleanup is missing: ${missing.join(', ')}`)

  const sql = postgres(environment.DATABASE_URL, {
    max: 1, prepare: false, ssl: environment.DATABASE_SSL === 'disable' ? false : 'require',
  })
  const storage = createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  try {
    const rows = await sql`
      select id, storage_bucket, storage_path
        from public.lab_assets
       where id in ${sql(assetIds)} and owner_id = ${userId}
         and asset_kind = 'document' and metadata->>'source' = 'chat.create_document'`
    if (rows.length !== assetIds.length) throw new Error('Refusing cleanup because the generated asset set did not match exactly.')
    const pathsByBucket = new Map()
    for (const row of rows) {
      pathsByBucket.set(row.storage_bucket, [...(pathsByBucket.get(row.storage_bucket) || []), row.storage_path])
    }
    for (const [bucket, paths] of pathsByBucket) {
      const removed = await storage.storage.from(bucket).remove(paths)
      if (removed.error) throw removed.error
    }
    await sql`delete from public.lab_assets where id in ${sql(assetIds)} and owner_id = ${userId}`
    console.log(`PASS  cleaned up ${assetIds.length} production smoke-test documents`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] || process.env.AI360_SMOKE_BASE_URL
  if (!baseUrl) throw new Error('Pass a deployment URL or set AI360_SMOKE_BASE_URL.')
  const envFile = process.argv[3] || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
  config({ path: envFile, quiet: true })
  const cleanupRequirements = ['DATABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PRIVATE_BUCKET']
  const missingCleanup = cleanupRequirements.filter((name) => !process.env[name]?.trim())
  if (missingCleanup.length) throw new Error(`Refusing to create smoke files without cleanup configuration: ${missingCleanup.join(', ')}`)
  const auth = await signInForSmoke(process.env)
  const assets = []
  try {
    await runDocumentChatSmoke(baseUrl, auth.cookie, fetch, (asset) => assets.push(asset))
  } finally {
    await cleanupSmokeAssets(process.env, auth.userId, assets.map((asset) => asset.assetId))
  }
  console.log(`\n${CASES.length}/${CASES.length} production document chat flows passed`)
}
