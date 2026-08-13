import assert from 'node:assert/strict'
import test from 'node:test'
import { isEmailConfigured, emailEnabled, qualityAlertRecipients, lowCreditThreshold } from '../src/lib/email/config.ts'
import { createResendProvider, EmailError } from '../src/lib/email/provider.ts'
import {
  escapeHtml, welcomeEmail, paymentReceiptEmail, lowCreditEmail, qualityUrgentAlertEmail,
} from '../src/lib/email/templates.ts'
import { deliverEmail } from '../src/lib/email/dispatch.ts'

const ENV_KEYS = ['EMAIL_ENABLED', 'EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'AI360_QUALITY_ALERT_EMAILS', 'AI360_LOW_CREDIT_THRESHOLD', 'NEXT_PUBLIC_APP_URL']

function withEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  for (const key of ENV_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const ENABLED = {
  EMAIL_ENABLED: 'true',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'AI360 <noreply@ai360.africa>',
  NEXT_PUBLIC_APP_URL: 'https://ai360.africa',
}

const stubProvider = (sent: unknown[], impl?: () => never) => ({
  name: 'resend',
  async send(message: unknown) {
    if (impl) impl()
    sent.push(message)
    return { id: 'em_stub', provider: 'resend' }
  },
})

// ---------------------------------------------------------------------------
// Configuration gate
// ---------------------------------------------------------------------------

test('email stays off until it is enabled, keyed and addressed', { concurrency: false }, () => {
  let restore = withEnv({ EMAIL_ENABLED: 'false', RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.com' })
  assert.equal(emailEnabled(), false)
  assert.equal(isEmailConfigured(), false)
  restore()

  restore = withEnv({ EMAIL_ENABLED: 'true', EMAIL_FROM: 'a@b.com' })
  assert.equal(isEmailConfigured(), false, 'a missing key must keep email off')
  restore()

  restore = withEnv({ EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_x', EMAIL_FROM: 'not-an-address' })
  assert.equal(isEmailConfigured(), false, 'an invalid sender must keep email off')
  restore()

  restore = withEnv(ENABLED)
  assert.equal(isEmailConfigured(), true)
  restore()
})

test('quality alert recipients are validated and low-credit threshold defaults', { concurrency: false }, () => {
  const restore = withEnv({ ...ENABLED, AI360_QUALITY_ALERT_EMAILS: 'ops@ai360.tech, not-valid , care@ai360.tech' })
  assert.deepEqual(qualityAlertRecipients(), ['ops@ai360.tech', 'care@ai360.tech'])
  assert.equal(lowCreditThreshold(), 5)
  restore()
})

// ---------------------------------------------------------------------------
// Provider transport
// ---------------------------------------------------------------------------

test('the Resend provider posts an authorized request and returns the message id', { concurrency: false }, async () => {
  const restore = withEnv(ENABLED)
  let calledUrl = ''
  let auth = ''
  let body: Record<string, unknown> = {}
  const provider = createResendProvider(async (url, init) => {
    calledUrl = String(url)
    auth = String((init?.headers as Record<string, string>).Authorization)
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ id: 'em_123' }), { status: 200 })
  })
  const result = await provider.send({
    to: 'ada@example.com', from: 'AI360 <lab@x.tech>', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi',
  })
  assert.equal(calledUrl, 'https://api.resend.com/emails')
  assert.equal(auth, 'Bearer re_test_key')
  assert.deepEqual(body.to, ['ada@example.com'])
  assert.equal(result.id, 'em_123')
  restore()
})

test('the provider maps transport failures to typed errors', { concurrency: false }, async () => {
  const restore = withEnv(ENABLED)
  const message = { to: 'a@b.com', from: 'x@y.tech', subject: 'S', html: '<p>b</p>', text: 'b' }

  const rejected = createResendProvider(async () => new Response('{}', { status: 422 }))
  await assert.rejects(rejected.send(message), (error: unknown) => error instanceof EmailError && error.code === 'rejected')

  const unauthorized = createResendProvider(async () => new Response('{}', { status: 401 }))
  await assert.rejects(unauthorized.send(message), (error: unknown) => error instanceof EmailError && error.code === 'not_configured')

  const offline = createResendProvider(async () => { throw new Error('network') })
  await assert.rejects(offline.send(message), (error: unknown) => error instanceof EmailError && error.code === 'unavailable')

  const noId = createResendProvider(async () => new Response('{}', { status: 200 }))
  await assert.rejects(noId.send(message), (error: unknown) => error instanceof EmailError && error.code === 'bad_response')
  restore()
})

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test('templates escape caller-supplied values and carry matching text', { concurrency: false }, () => {
  const restore = withEnv(ENABLED)
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;')

  const welcome = welcomeEmail({ name: 'Ada <script>' })
  assert.match(welcome.subject, /Welcome/)
  assert.doesNotMatch(welcome.html, /<script>/, 'a hostile display name must not survive into the markup')
  assert.match(welcome.html, /Ada/)
  assert.ok(welcome.text.length > 0)

  const receipt = paymentReceiptEmail({ name: 'Kojo', planName: 'Everyday', amountGhs: 125, credits: 120, orderId: 'pay_abc' })
  assert.match(receipt.subject, /Everyday/)
  assert.match(receipt.html, /GH₵125\.00/)
  assert.match(receipt.html, /120/)
  assert.match(receipt.html, /pay_abc/)

  const low = lowCreditEmail({ name: 'Ama', available: 1, planName: 'Explorer' })
  assert.match(low.html, /1 credit\b/, 'singular credit wording')

  const alert = qualityUrgentAlertEmail({ reference: 'q_1', severity: 's0', category: 'accuracy', summary: 'wrong figure' })
  assert.match(alert.subject, /^\[S0\]/)
  restore()
})

// ---------------------------------------------------------------------------
// Dispatch seam
// ---------------------------------------------------------------------------

test('dispatch is a no-op while email is disabled', { concurrency: false }, async () => {
  const restore = withEnv({ EMAIL_ENABLED: 'false' })
  const sent: unknown[] = []
  const result = await deliverEmail('welcome', { to: 'a@b.com', data: { name: 'Ada' } }, stubProvider(sent))
  assert.deepEqual(result, { delivered: false, reason: 'disabled' })
  assert.equal(sent.length, 0, 'no provider call may happen while disabled')
  restore()
})

test('dispatch skips a message that has no recipient', { concurrency: false }, async () => {
  const restore = withEnv(ENABLED)
  const sent: unknown[] = []
  const result = await deliverEmail('welcome', { to: null, data: { name: 'Ada' } }, stubProvider(sent))
  assert.deepEqual(result, { delivered: false, reason: 'no_recipient' })
  assert.equal(sent.length, 0)
  restore()
})

test('dispatch delivers and stamps the sender, kind tag and recipient array', { concurrency: false }, async () => {
  const restore = withEnv(ENABLED)
  const sent: { from: string; to: string[]; tags: Record<string, string> }[] = []
  const result = await deliverEmail('welcome', { to: 'ada@example.com', data: { name: 'Ada' } }, stubProvider(sent) as never)
  assert.equal(result.delivered, true)
  assert.equal(sent[0].from, 'AI360 <noreply@ai360.africa>')
  assert.deepEqual(sent[0].to, ['ada@example.com'])
  assert.equal(sent[0].tags.kind, 'welcome')
  restore()
})

test('urgent alerts route to the configured reviewer list, not a caller address', { concurrency: false }, async () => {
  const restore = withEnv({ ...ENABLED, AI360_QUALITY_ALERT_EMAILS: 'ops@ai360.tech' })
  const sent: { to: string[] }[] = []
  const result = await deliverEmail(
    'quality_urgent_alert',
    { data: { reference: 'q_1', severity: 's0', category: 'accuracy', summary: 'x' } },
    stubProvider(sent) as never,
  )
  assert.equal(result.delivered, true)
  assert.deepEqual(sent[0].to, ['ops@ai360.tech'])
  restore()
})

test('a provider rejection is reported, never thrown into the caller', { concurrency: false }, async () => {
  const restore = withEnv(ENABLED)
  const failing = { name: 'resend', async send() { throw new EmailError('rejected', 'no') } }
  const result = await deliverEmail('welcome', { to: 'a@b.com', data: { name: 'Ada' } }, failing)
  assert.deepEqual(result, { delivered: false, reason: 'rejected' })
  restore()
})
