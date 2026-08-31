import assert from 'node:assert/strict'
import test from 'node:test'
import {
  signVideoWebhook, verifyVideoWebhookSignature, WEBHOOK_TOLERANCE_SECONDS,
} from '../src/lib/media/video-webhook.ts'

/**
 * This check is the only thing between an unauthenticated POST and a path that
 * marks renders delivered and settles credit holds. It is worth testing as
 * behaviour rather than reading as code.
 */

const SECRET = 'whsec_test_secret'
const NOW = 1750000000
const BODY = '{"type":"video.generation.completed","data":{"id":"vid_123","status":"completed"}}'

const bytes = (value: string) => new Uint8Array(Buffer.from(value, 'utf8'))
const header = (timestamp: number, signature: string) => `t=${timestamp},v1=${signature}`

function validHeader(options: { timestamp?: number; body?: string; secret?: string } = {}) {
  const timestamp = options.timestamp ?? NOW
  return header(timestamp, signVideoWebhook({
    rawBody: bytes(options.body ?? BODY),
    timestamp,
    secret: options.secret ?? SECRET,
  }))
}

const verify = (options: { header: string; body?: string; secret?: string; now?: number }) =>
  verifyVideoWebhookSignature({
    rawBody: bytes(options.body ?? BODY),
    header: options.header,
    secret: options.secret ?? SECRET,
    nowSeconds: options.now ?? NOW,
  })

/**
 * Pinned against OpenRouter's documented scheme: HMAC-SHA256, hex, over the
 * bytes of `<timestamp>,<raw_body>`.
 *
 * A round-trip test alone would pass even if the signed payload were built
 * wrongly, as long as it were built wrongly in both directions. This vector is
 * what makes that impossible — drop the comma, reorder the parts, or switch to
 * base64 and this fails immediately rather than in production.
 */
test('the signed payload matches the documented construction', () => {
  assert.equal(
    signVideoWebhook({ rawBody: bytes(BODY), timestamp: NOW, secret: SECRET }),
    '9841b5503d6b131b10e79638d95b1c7b37de00f7b6af8865dab4f354ef4ff16a',
  )
  assert.equal(verify({ header: validHeader() }), true)
})

test('hex case is a spelling, not a forgery', () => {
  const signature = signVideoWebhook({ rawBody: bytes(BODY), timestamp: NOW, secret: SECRET })
  assert.equal(verify({ header: header(NOW, signature.toUpperCase()) }), true)
  assert.equal(verify({ header: header(NOW, signature) }), true)
})

test('a body that changed after signing is rejected', () => {
  const signed = validHeader()
  // One character different: the id the render would be credited against.
  const tampered = BODY.replace('vid_123', 'vid_124')
  assert.equal(verify({ header: signed, body: tampered }), false)
  // And the whitespace-only reserialisation that a JSON round-trip produces.
  assert.equal(verify({ header: signed, body: JSON.stringify(JSON.parse(BODY), null, 2) }), false)
})

test('another workspace secret cannot sign for this one', () => {
  assert.equal(verify({ header: validHeader({ secret: 'whsec_someone_else' }) }), false)
  assert.equal(verify({ header: validHeader(), secret: 'whsec_someone_else' }), false)
  // An unconfigured secret must never mean "accept anything".
  assert.equal(verify({ header: validHeader(), secret: '' }), false)
})

/**
 * The timestamp is inside the signed payload precisely so a captured delivery
 * cannot be replayed later under a fresh timestamp. If it were signed over the
 * body alone, moving `t=` forward would keep the signature valid forever.
 */
test('a captured delivery cannot be replayed under a new timestamp', () => {
  const signature = signVideoWebhook({ rawBody: bytes(BODY), timestamp: NOW, secret: SECRET })
  assert.equal(verify({ header: header(NOW + 1, signature) }), false)
  assert.equal(verify({ header: header(NOW - 1, signature) }), false)
})

test('deliveries outside the tolerance window are rejected', () => {
  const inside = WEBHOOK_TOLERANCE_SECONDS - 1
  const outside = WEBHOOK_TOLERANCE_SECONDS + 1
  assert.equal(verify({ header: validHeader({ timestamp: NOW - inside }) }), true)
  assert.equal(verify({ header: validHeader({ timestamp: NOW - outside }) }), false)
  // Clock skew cuts both ways, so the window is symmetric.
  assert.equal(verify({ header: validHeader({ timestamp: NOW + inside }) }), true)
  assert.equal(verify({ header: validHeader({ timestamp: NOW + outside }) }), false)
})

test('a malformed header is rejected rather than parsed generously', () => {
  const signature = signVideoWebhook({ rawBody: bytes(BODY), timestamp: NOW, secret: SECRET })
  for (const value of [
    '',
    signature,                              // bare signature, no scheme
    `t=${NOW}`,                             // no signature
    `v1=${signature}`,                      // no timestamp
    `t=,v1=${signature}`,                   // empty timestamp
    `t=${NOW},v1=`,                         // empty signature
    `t=not-a-number,v1=${signature}`,
    `t=${NOW},v1=${signature.slice(0, 63)}`, // short hex
    `t=${NOW},v1=${signature}ab`,            // long hex
    `t=${NOW},v1=${'z'.repeat(64)}`,         // not hex
    `t=${NOW},v2=${signature}`,              // unknown scheme version
  ]) {
    assert.equal(verify({ header: value }), false, `accepted malformed header: ${value || '(empty)'}`)
  }
})

test('whitespace between the header parts is tolerated', () => {
  const signature = signVideoWebhook({ rawBody: bytes(BODY), timestamp: NOW, secret: SECRET })
  assert.equal(verify({ header: `t=${NOW}, v1=${signature}` }), true)
})
