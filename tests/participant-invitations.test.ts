import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createUnsubscribeToken,
  isUnsubscribeConfigured,
  readUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeUrl,
} from '../src/lib/email/unsubscribe.ts'
import { renderAdminParticipantEmail } from '../src/lib/admin/participant-email.ts'
import { createResendProvider } from '../src/lib/email/provider.ts'

const ENV_KEYS = [
  'AI360_EMAIL_UNSUBSCRIBE_SECRET', 'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_APP_URL', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'RESEND_API_KEY',
]

function withEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  for (const key of ENV_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value
  }
  return () => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const SIGNED = {
  AI360_EMAIL_UNSUBSCRIBE_SECRET: 'unsubscribe-secret-value-long-enough',
  NEXT_PUBLIC_APP_URL: 'https://ai360.africa',
}

// ---------------------------------------------------------------------------
// Opt-out tokens

test('an opt-out token round-trips the participant it was issued for', () => {
  const restore = withEnv(SIGNED)
  try {
    const token = createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' })
    assert.ok(token)
    assert.deepEqual(readUnsubscribeToken(token), {
      kind: 'member', userId: 'user_1', programKey: 'pilot',
    })
  } finally {
    restore()
  }
})

test('an invitee opt-out is a distinct kind, because there is no account to mark', () => {
  const restore = withEnv(SIGNED)
  try {
    const token = createUnsubscribeToken({ kind: 'invitation', invitationId: 'invitation_1', programKey: 'pilot' })
    assert.deepEqual(readUnsubscribeToken(token), {
      kind: 'invitation', invitationId: 'invitation_1', programKey: 'pilot',
    })
  } finally {
    restore()
  }
})

test('a token signed with another secret is refused', () => {
  const restore = withEnv(SIGNED)
  let token: string | null = null
  try {
    token = createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' })
  } finally {
    restore()
  }
  const second = withEnv({ ...SIGNED, AI360_EMAIL_UNSUBSCRIBE_SECRET: 'a-completely-different-secret-value' })
  try {
    assert.equal(readUnsubscribeToken(token), null)
  } finally {
    second()
  }
})

test('a tampered payload does not survive verification', () => {
  const restore = withEnv(SIGNED)
  try {
    const token = createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' })!
    const [, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ k: 'm', s: 'user_2', p: 'pilot', t: Date.now() })).toString('base64url')
    assert.equal(readUnsubscribeToken(`${forged}.${signature}`), null)
  } finally {
    restore()
  }
})

test('malformed tokens are rejected rather than throwing', () => {
  const restore = withEnv(SIGNED)
  try {
    assert.equal(readUnsubscribeToken(''), null)
    assert.equal(readUnsubscribeToken(null), null)
    assert.equal(readUnsubscribeToken('no-separator'), null)
    assert.equal(readUnsubscribeToken('.'), null)
    assert.equal(readUnsubscribeToken('....'), null)
    assert.equal(readUnsubscribeToken('bm90LWpzb24.aGVsbG8'), null)
  } finally {
    restore()
  }
})

test('without a signing secret no link is minted rather than an unsigned one', () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: 'https://ai360.africa' })
  try {
    assert.equal(isUnsubscribeConfigured(), false)
    assert.equal(createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' }), null)
    assert.equal(readUnsubscribeToken('anything.atall'), null)
  } finally {
    restore()
  }
})

test('the service role key is accepted as a fallback signing secret', () => {
  const restore = withEnv({
    SUPABASE_SECRET_KEY: 'service-role-key-long-enough-to-sign',
    NEXT_PUBLIC_APP_URL: 'https://ai360.africa',
  })
  try {
    assert.equal(isUnsubscribeConfigured(), true)
    const token = createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' })
    assert.ok(token && readUnsubscribeToken(token))
  } finally {
    restore()
  }
})

test('the opt-out URL is absolute and carries the token safely', () => {
  const restore = withEnv(SIGNED)
  try {
    const token = createUnsubscribeToken({ kind: 'member', userId: 'user_1', programKey: 'pilot' })!
    const url = new URL(unsubscribeUrl(token))
    assert.equal(url.origin, 'https://ai360.africa')
    assert.equal(url.pathname, '/api/email/unsubscribe')
    assert.equal(url.searchParams.get('token'), token)
  } finally {
    restore()
  }
})

test('the RFC 8058 header pair asks for one-click handling', () => {
  const headers = unsubscribeHeaders('https://ai360.africa/api/email/unsubscribe?token=abc')
  assert.equal(headers['List-Unsubscribe'], '<https://ai360.africa/api/email/unsubscribe?token=abc>')
  assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

// ---------------------------------------------------------------------------
// Invitation rendering

test('an invitation points at its sign-up link, not the app front door', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      actionUrl: 'https://project.supabase.co/auth/v1/verify?token=xyz',
      unsubscribeUrl: 'https://ai360.africa/api/email/unsubscribe?token=abc',
    })
    assert.match(rendered.html, /href="https:\/\/project\.supabase\.co\/auth\/v1\/verify\?token=xyz"/)
    assert.match(rendered.text, /https:\/\/project\.supabase\.co\/auth\/v1\/verify\?token=xyz/)
    assert.match(rendered.html, /Unsubscribe/)
    assert.match(rendered.text, /Unsubscribe: https:\/\/ai360\.africa/)
    assert.match(rendered.html, /Hi Ada,/)
  } finally {
    restore()
  }
})

test('a message without an opt-out link renders no opt-out text at all', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'onboarding_reminder',
      displayName: null,
      email: 'lin@example.com',
      unsubscribeUrl: null,
    })
    assert.doesNotMatch(rendered.html, /Unsubscribe/)
    assert.doesNotMatch(rendered.text, /Unsubscribe/)
    // Falls back to the app URL when no explicit action link is supplied.
    assert.match(rendered.html, /href="https:\/\/ai360\.africa"/)
  } finally {
    restore()
  }
})

test('an operator note is escaped rather than rendered as markup', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada',
      email: 'ada@example.com',
      operatorNote: '<script>alert(1)</script>',
    })
    assert.doesNotMatch(rendered.html, /<script>/)
    assert.match(rendered.html, /&lt;script&gt;/)
  } finally {
    restore()
  }
})

// ---------------------------------------------------------------------------
// Provider handling of the new fields

test('a rate limit is distinguished from an outage so a bulk run can retry it', async () => {
  const restore = withEnv({ ...SIGNED, RESEND_API_KEY: 're_test_key' })
  try {
    const provider = createResendProvider(async () => new Response('', { status: 429 }))
    await assert.rejects(
      provider.send({ to: 'a@example.com', from: 'AI360 <n@ai360.africa>', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }),
      (error: unknown) => (error as { code?: string }).code === 'rate_limited',
    )
  } finally {
    restore()
  }
})

test('headers carrying a newline are dropped, not smuggled into the message', async () => {
  const restore = withEnv({ ...SIGNED, RESEND_API_KEY: 're_test_key' })
  try {
    let body: Record<string, unknown> = {}
    const provider = createResendProvider(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return Response.json({ id: 'em_1' })
    })
    await provider.send({
      to: 'a@example.com', from: 'AI360 <n@ai360.africa>', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi',
      headers: {
        'List-Unsubscribe': '<https://ai360.africa/u?token=abc>',
        'X-Evil': 'value\r\nBcc: attacker@example.com',
        'Bad Name': 'ok',
      },
    })
    assert.deepEqual(body.headers, { 'List-Unsubscribe': '<https://ai360.africa/u?token=abc>' })
  } finally {
    restore()
  }
})

test('a message with no headers does not send an empty headers field', async () => {
  const restore = withEnv({ ...SIGNED, RESEND_API_KEY: 're_test_key' })
  try {
    let body: Record<string, unknown> = {}
    const provider = createResendProvider(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return Response.json({ id: 'em_1' })
    })
    await provider.send({ to: 'a@example.com', from: 'AI360 <n@ai360.africa>', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })
    assert.equal('headers' in body, false)
  } finally {
    restore()
  }
})
