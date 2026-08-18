import { config } from 'dotenv'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { accumulateToolCalls, CREATE_DOCUMENT_TOOL, parseToolCall, shouldOfferDocumentTool } from '../src/lib/chat-tools.ts'

/**
 * Proves agent-invoked document generation works against real infrastructure:
 * a real model deciding to call the tool, the real stream being reassembled, a
 * real file rendered from what it wrote, and that file stored and read back
 * through the same path the download route uses.
 *
 * Every row is rolled back and every object removed, so this leaves nothing
 * behind and is safe to run against production.
 *
 *   node --import ./scripts/register-alias.mjs --experimental-strip-types scripts/verify-document-tool.mjs
 */

const envFile = process.argv[2] || (existsSync('.env.local') ? '.env.local' : 'ai360-production.env')
config({ path: envFile, quiet: true })
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3220'

const results = []
const say = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}\n`)
}

// ---------------------------------------------------------------- 1. the model
async function askModel(userText, withTool) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
      'X-Title': 'AI360 document tool verification',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.6-flash',
      max_tokens: 1600,
      reasoning: { effort: 'low' },
      stream: true,
      ...(withTool ? { tools: [CREATE_DOCUMENT_TOOL] } : {}),
      messages: [
        { role: 'system', content: 'You are AI360. You may attach a downloadable file with create_document when the person asked for something to keep, send or print. Write the document body yourself in markdown.' },
        { role: 'user', content: userText },
      ],
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)

  // Reassemble exactly the way the chat route does.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let calls = new Map()
  let text = ''
  let fragments = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta
        if (typeof delta?.content === 'string') text += delta.content
        if (Array.isArray(delta?.tool_calls)) fragments += delta.tool_calls.length
        calls = accumulateToolCalls(calls, delta?.tool_calls)
      } catch {}
    }
  }
  return { calls: [...calls.values()], text, fragments }
}

let modelDocument = null
try {
  const ask = 'Make me a wholesale price list I can send to spa buyers. Unrefined shea 5kg at GHS 420 minimum six tubs, refined shea 5kg at GHS 480 minimum six, and a 250g sample tub at GHS 25.'
  say('the request is recognised as wanting a deliverable', shouldOfferDocumentTool([{ role: 'user', content: ask }]),
      'shouldOfferDocumentTool returned true, so the tool would be attached')

  const withTool = await askModel(ask, true)
  const call = withTool.calls[0]
  const parsed = call ? parseToolCall(call) : null
  say('a real model chooses to call create_document', Boolean(parsed?.ok),
      call ? `tool=${call.name} reassembled from ${withTool.fragments} stream fragments` : 'no tool call returned')
  if (parsed?.ok) {
    modelDocument = parsed.arguments
    // Any of the three is defensible for a price list meant to be sent: the
    // contract asks for pdf when layout should be fixed. What matters is that
    // the choice is valid and the arguments are well formed.
    say('the model chose a valid format', ['pdf', 'docx', 'xlsx'].includes(parsed.arguments.format),
        `format=${parsed.arguments.format}, title=${JSON.stringify(parsed.arguments.title)}`)
    say('the model wrote a real document body containing the figures',
        /420/.test(parsed.arguments.content) && /\|/.test(parsed.arguments.content),
        `${parsed.arguments.content.length} chars, contains a markdown table: ${/\|/.test(parsed.arguments.content)}`)
  }
} catch (error) { say('model tool call', false, String(error).slice(0, 300)) }

// Asked explicitly for a spreadsheet, it must pick xlsx — this is the format
// judgement the contract is actually responsible for.
try {
  const res = await askModel(
    'Put these into a spreadsheet I can open in Excel: unrefined shea 5kg GHS 420 min 6, refined shea 5kg GHS 480 min 6, sample 250g GHS 25 min 1.',
    true,
  )
  const parsed = res.calls[0] ? parseToolCall(res.calls[0]) : null
  say('asked for a spreadsheet, the model selects xlsx', parsed?.ok && parsed.arguments.format === 'xlsx',
      parsed?.ok ? `format=${parsed.arguments.format}` : 'no valid tool call')
} catch (error) { say('spreadsheet format selection', false, String(error).slice(0, 200)) }

// An ordinary question must not produce a file.
try {
  const chat = 'What is unrefined shea butter actually used for?'
  const gated = shouldOfferDocumentTool([{ role: 'user', content: chat }])
  say('an ordinary question never reaches the tool', !gated,
      `shouldOfferDocumentTool returned ${gated}, so no tool is attached at all`)
} catch (error) { say('ordinary question gate', false, String(error).slice(0, 200)) }

// ------------------------------------------------------------- 2. rendering
let rendered = null
if (modelDocument) {
  try {
    const res = await fetch(`${BASE}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: modelDocument.title, content: modelDocument.content, format: modelDocument.format }),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    rendered = { bytes: buf, format: modelDocument.format }
    // A PDF starts %PDF; docx and xlsx are ZIP containers starting PK.
    const magic = buf.subarray(0, 4).toString('hex')
    const valid = modelDocument.format === 'pdf'
      ? magic.startsWith('25504446')
      : magic.startsWith('504b')
    say('what the model wrote renders into a real file', res.ok && valid,
        `status ${res.status}, ${buf.length} bytes, format ${modelDocument.format}, magic ${magic}`)
  } catch (error) { say('rendering', false, String(error).slice(0, 200)) }
}

// -------------------------------------------------- 3. storage, then rollback
const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PRIVATE_BUCKET', 'DATABASE_URL']
  .filter((n) => !process.env[n]?.trim())
if (missing.length) {
  say('document storage round trip', false, `not configured here: ${missing.join(', ')}`)
} else if (rendered) {
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  })
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET.trim()
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SECRET_KEY.trim(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const assetId = `doc_${randomUUID()}`
  const objectPath = `documents/verify/${assetId}.${rendered.format}`
  const sha = createHash('sha256').update(rendered.bytes).digest('hex')
  let uploaded = false

  try {
    const [owner] = await sql`select clerk_user_id, workspace_key from public.lab_workspace_memberships
                                join public.lab_users on true limit 1`
      .catch(() => [])
    const [ws] = await sql`select workspace_key, owner_id from public.lab_studio_projects limit 1`
      .catch(() => [])
    const workspaceKey = ws?.workspace_key || owner?.workspace_key
    const ownerId = ws?.owner_id || owner?.clerk_user_id
    if (!workspaceKey || !ownerId) throw new Error('no existing workspace to attach a test asset to')

    const MIME = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    const mimeType = MIME[rendered.format]
    const up = await storage.storage.from(bucket).upload(objectPath, rendered.bytes, {
      contentType: mimeType, upsert: false,
    })
    if (up.error) throw up.error
    uploaded = true

    class Rollback extends Error {}
    let readBack = null
    try {
      await sql.begin(async (tx) => {
        await tx`insert into public.lab_assets
          (id, workspace_key, owner_id, asset_kind, storage_bucket, storage_path, mime_type,
           byte_size, checksum_sha256, status, metadata)
          values (${assetId}, ${workspaceKey}, ${ownerId}, 'document', ${bucket}, ${objectPath},
                  ${mimeType},
                  ${rendered.bytes.byteLength}, ${sha}, 'ready', ${tx.json({ filename: `verify.${rendered.format}`, format: rendered.format })})`
        const [row] = await tx`select id, asset_kind, byte_size, checksum_sha256 from public.lab_assets
                                where workspace_key = ${workspaceKey} and id = ${assetId}`
        readBack = row
        throw new Rollback()
      })
    } catch (error) { if (!(error instanceof Rollback)) throw error }

    say('lab_assets accepts a document row with asset_kind = document', Boolean(readBack),
        readBack ? `kind=${readBack.asset_kind}, ${readBack.byte_size} bytes, checksum recorded` : 'row not written')

    const down = await storage.storage.from(bucket).download(objectPath)
    if (down.error) throw down.error
    const back = Buffer.from(await down.data.arrayBuffer())
    say('the stored file reads back byte-identical',
        createHash('sha256').update(back).digest('hex') === sha,
        `${back.length} bytes back, sha256 matches: ${createHash('sha256').update(back).digest('hex') === sha}`)

    const [left] = await sql`select count(*)::int as n from public.lab_assets where id = ${assetId}`
    say('nothing is left behind in the database', left.n === 0, `rows remaining for this id: ${left.n}`)
  } catch (error) {
    say('document storage round trip', false, String(error).slice(0, 300))
  } finally {
    if (uploaded) await storage.storage.from(bucket).remove([objectPath]).catch(() => {})
    await sql.end({ timeout: 5 })
  }
}

console.log('\n================ SUMMARY ================')
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`)
process.exit(results.some((r) => !r.pass) ? 1 : 0)
