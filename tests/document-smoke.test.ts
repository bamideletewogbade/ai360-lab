import assert from 'node:assert/strict'
import test from 'node:test'
import { runDocumentChatSmoke } from '../scripts/smoke-chat-documents.mjs'

test('production document smoke exercises chat attachments and authenticated downloads for every format', async () => {
  const seen = new Map<string, number>()
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    assert.match(String(new Headers(init?.headers).get('cookie')), /smoke-auth/)
    if (url.pathname === '/api/chat') {
      const payload = JSON.parse(String(init?.body))
      const format = /XLSX/i.test(payload.messages[0].content)
        ? 'xlsx'
        : /DOCX/i.test(payload.messages[0].content) ? 'docx' : 'pdf'
      seen.set(format, (seen.get(format) || 0) + 1)
      return new Response([
        JSON.stringify({ type: 'attachment', assetId: `asset-${format}`, filename: `smoke.${format}`, title: 'Smoke', format, byteSize: 800 }),
        JSON.stringify({ type: 'delta', text: 'Created.' }),
        JSON.stringify({ type: 'done' }),
        '',
      ].join('\n'))
    }
    const format = url.searchParams.get('assetId')?.replace('asset-', '') || ''
    const mime = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }[format]
    const prefix = format === 'pdf' ? Buffer.from('%PDF') : Buffer.from('PK\x03\x04')
    return new Response(Buffer.concat([prefix, Buffer.alloc(600)]), {
      headers: { 'Content-Type': mime || '', 'Content-Disposition': `attachment; filename="smoke.${format}"` },
    })
  }

  const assets = await runDocumentChatSmoke('https://production.example.com', 'smoke-auth=1', request as typeof fetch)
  assert.deepEqual(assets.map((asset) => asset.format), ['pdf', 'docx', 'xlsx'])
  assert.deepEqual(Object.fromEntries(seen), { pdf: 1, docx: 1, xlsx: 1 })
})

test('a partial document smoke reports every created asset so production cleanup can still remove it', async () => {
  const created: string[] = []
  let chatCount = 0
  const request = async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/chat') {
      chatCount += 1
      if (chatCount === 1) return new Response([
        JSON.stringify({ type: 'attachment', assetId: 'partial-pdf', filename: 'partial.pdf', title: 'Partial', format: 'pdf', byteSize: 800 }),
        JSON.stringify({ type: 'done' }), '',
      ].join('\n'))
      return new Response(JSON.stringify({ type: 'error', code: 'provider_failed', message: 'Stopped' }) + '\n')
    }
    return new Response(Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(600)]), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="partial.pdf"' },
    })
  }

  await assert.rejects(
    runDocumentChatSmoke('https://production.example.com', 'smoke-auth=1', request as typeof fetch, (asset) => created.push(asset.assetId)),
    /stream failed/,
  )
  assert.deepEqual(created, ['partial-pdf'])
})
