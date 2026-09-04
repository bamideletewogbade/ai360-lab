import assert from 'node:assert/strict'
import test from 'node:test'
import { chatProviderFailure, pdfParserFallback } from '../src/lib/chat-provider-failure.ts'

test('a PDF rejected with HTTP 400 gets one native-parser fallback', () => {
  assert.equal(pdfParserFallback({ hasPdf: true, status: 400, engine: 'cloudflare-ai' }), 'native')
  assert.equal(pdfParserFallback({ hasPdf: true, status: 400, engine: 'native' }), null)
  assert.equal(pdfParserFallback({ hasPdf: true, status: 502, engine: 'cloudflare-ai' }), null)
  assert.equal(pdfParserFallback({ hasPdf: false, status: 400, engine: 'cloudflare-ai' }), null)
})

test('an attachment-specific 400 does not encourage the same doomed retry', () => {
  const failure = chatProviderFailure({ status: 400, hasAttachments: true, hasPdf: true })
  assert.equal(failure.code, 'attachment_rejected')
  assert.equal(failure.outcome, 'attachment_error')
  assert.equal(failure.retryable, false)
  assert.match(failure.message, /standard, unencrypted PDF/)
})

test('transient provider failures remain retryable', () => {
  assert.equal(chatProviderFailure({ status: 429, hasAttachments: false, hasPdf: false }).retryable, true)
  assert.equal(chatProviderFailure({ status: 503, hasAttachments: true, hasPdf: true }).retryable, true)
  assert.equal(chatProviderFailure({ status: 401, hasAttachments: false, hasPdf: false }).retryable, false)
})
