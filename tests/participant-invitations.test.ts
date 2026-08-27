import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  createUnsubscribeToken,
  isUnsubscribeConfigured,
  readUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeUrl,
} from '../src/lib/email/unsubscribe.ts'
import {
  COPY_LIMITS, participantCopyFor, renderAdminParticipantEmail, reviewParticipantCopy,
} from '../src/lib/admin/participant-email.ts'
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

// ---------------------------------------------------------------------------
// Operator edits to one send

test('an operator edit replaces only the field it touched', () => {
  const restore = withEnv(SIGNED)
  try {
    const written = participantCopyFor('pilot_invite')
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      copyOverride: { heading: 'A different heading entirely' },
    })
    assert.match(rendered.html, /A different heading entirely/)
    // Everything the operator did not touch still follows the written copy,
    // so a one-word fix cannot silently freeze the rest of the message.
    assert.ok(rendered.text.includes(written.body))
    assert.equal(rendered.subject, written.subject)
  } finally {
    restore()
  }
})

test('a blank edit to a required field keeps the written copy', () => {
  const restore = withEnv(SIGNED)
  try {
    const written = participantCopyFor('pilot_invite')
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      // An emptied subject box is a mistake in an editor, never an intention:
      // a message with no subject line must not be sendable by accident.
      copyOverride: { subject: '   ', cta: '' },
    })
    assert.equal(rendered.subject, written.subject)
    assert.ok(rendered.text.includes(written.cta))
  } finally {
    restore()
  }
})

test('an emptied optional section is removed rather than left blank', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      copyOverride: { closing: '', steps: [] },
    })
    assert.doesNotMatch(rendered.html, /<ol/)
    assert.doesNotMatch(rendered.html, /Thank you for being one of the first/)
  } finally {
    restore()
  }
})

test('an edit cannot break out of the template into markup', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      copyOverride: {
        heading: '<script>alert(1)</script>',
        steps: ['<img src=x onerror=alert(1)>'],
      },
    })
    // What matters is that no tag can form: the angle brackets are escaped, so
    // the payload is delivered as visible text. Asserting the absence of the
    // substring "onerror=" would be the wrong test — it survives harmlessly
    // inside `&lt;img src=x onerror=alert(1)&gt;`, which renders as characters.
    assert.doesNotMatch(rendered.html, /<script/i)
    assert.doesNotMatch(rendered.html, /<img/i)
    assert.match(rendered.html, /&lt;script&gt;/)
    assert.match(rendered.html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  } finally {
    restore()
  }
})

test('an over-long edit is trimmed rather than sent whole', () => {
  const restore = withEnv(SIGNED)
  try {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      copyOverride: { subject: 'x'.repeat(400) },
    })
    assert.equal(rendered.subject.length, COPY_LIMITS.subject)
  } finally {
    restore()
  }
})

test('the wording review catches the operational detail the copy excludes', () => {
  // These are the exact things the written invitation was stripped of. An
  // editable field is how they come back, so the reviewer is what stands
  // between one edit and sixty-three people being told the wrong thing.
  assert.ok(reviewParticipantCopy({ body: 'You have 120 credits to spend.' }).length)
  assert.ok(reviewParticipantCopy({ body: 'It is worth GH₵125 a month.' }).length)
  assert.ok(reviewParticipantCopy({ detail: 'You are on the Everyday plan.' }).length)
  assert.ok(reviewParticipantCopy({ closing: 'We will add more when you run out.' }).length)
  assert.ok(reviewParticipantCopy({ body: 'Ask us for a top-up.' }).length)
})

test('the wording review passes the copy we actually ship', () => {
  // A reviewer that objects to the written invitation would be noise, and an
  // operator who sees a warning on every send stops reading them.
  assert.deepEqual(reviewParticipantCopy(participantCopyFor('pilot_invite')), [])
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

test('an invited participant is placed on a plan, not just handed credits', async () => {
  const claim = await readFile(new URL('../src/lib/admin/invitation-claim.ts', import.meta.url), 'utf8')

  // Credits alone leave the person on Explorer, capped at ten chat messages a
  // day, so their allowance drains on the cheapest work in the product and
  // never reaches what the pilot is measuring.
  assert.match(claim, /grantSponsoredEntitlement/, 'the claim must grant the plan, not only credits')
  assert.match(claim, /PILOT_ENTITLEMENT_PLAN = 'everyday'/, 'the pilot plan must be Everyday')

  // The entitlement must never be able to block a sign-in.
  assert.match(claim, /catch \(cause\)/, 'an entitlement failure must be caught')

  // startingCredits is additive now, so it must not be the thing that decides
  // whether anything is granted at all.
  assert.doesNotMatch(claim, /let creditsGranted = 0\s*\n\s*if \(claimed\.startingCredits/,
    'credits must no longer be gated solely on startingCredits')
})

test('the invitation email guides rather than gestures', async () => {
  const { renderAdminParticipantEmail } = await import('../src/lib/admin/participant-email.ts')
  const rendered = renderAdminParticipantEmail({
    template: 'pilot_invite',
    displayName: 'Ada Boateng',
    email: 'ada@example.com',
    actionUrl: 'https://ai360.africa/auth/callback?token_hash=abc&type=invite',
    unsubscribeUrl: 'https://ai360.africa/api/email/unsubscribe?token=x',
  })

  assert.match(rendered.html, /Ada/, 'it should greet them by name')

  // Internal decisions stay internal. The allowance, the plan price it maps to
  // and any promise to top somebody up are programme choices, not facts a
  // thank-you note should commit to — and naming them invites questions the
  // message cannot answer without disclosing more still.
  for (const leak of [/\d+ credits/, /GH₵/, /Everyday plan/i, /we will add more/i, /top(-| )?up/i]) {
    assert.doesNotMatch(rendered.html, leak, `operational detail leaked: ${leak}`)
    assert.doesNotMatch(rendered.text, leak, `operational detail leaked: ${leak}`)
  }
  // Numbered guidance, present in both halves of the message.
  assert.match(rendered.html, /<ol/, 'steps render as a list, not a paragraph')
  assert.match(rendered.text, /1\. /, 'the plain-text half must carry the steps too')
  assert.match(rendered.text, /5\. /)
  // A text alternative that is merely a stub scores worse with spam filters.
  assert.ok(rendered.text.length > 700, 'the plain-text alternative must be real')
  assert.match(rendered.html, /auth\/callback\?token_hash=abc/, 'the sign-in link must survive escaping')
  assert.match(rendered.html, /Unsubscribe/)
})

test('greets people by the name they actually have, not the first word they typed', async () => {
  const { renderAdminParticipantEmail } = await import('../src/lib/admin/participant-email.ts')
  const greet = (displayName: string | null, email = 'someone@example.com') =>
    renderAdminParticipantEmail({ template: 'pilot_invite', displayName, email })

  // Every case below is a real row from the pilot-2026-09 list.
  const cases = [
    ['The Fatima Abubakar', 'Fatima'],       // a title, not a name
    ['ALBERT OBENG', 'Albert'],              // shouting at somebody you are thanking
    ['NURUDEEN KANANZOE YAKUBU', 'Nurudeen'],
    ['YAW ADDO', 'Yaw'],
    ['KORBLAH AKWESHIE', 'Korblah'],
    ['Raymond yaw afram quaye McCarthy', 'Raymond'],
    ['Grace Naa Aku Addoquaye', 'Grace'],
    ['Kobe', 'Kobe'],
  ]
  for (const [input, expected] of cases) {
    const rendered = greet(input)
    assert.match(rendered.html, new RegExp(`Hi ${expected},`), `"${input}" should greet as "${expected}"`)
    assert.match(rendered.text, new RegExp(`Hi ${expected},`), `"${input}" plain text should match the HTML`)
  }
})

test('a name that is already correct is never re-cased', async () => {
  const { renderAdminParticipantEmail } = await import('../src/lib/admin/participant-email.ts')
  // Tidying somebody's own spelling is a worse failure than the one being
  // fixed, so only all-capitals words — which carry no intended casing — move.
  for (const name of ['McCarthy Boateng', "O'Brien Mensah", 'deGraft Johnson']) {
    const rendered = renderAdminParticipantEmail({
      template: 'pilot_invite', displayName: name, email: 'x@example.com',
    })
    const expected = name.split(' ')[0]
    assert.ok(
      rendered.text.includes(`Hi ${expected},`) || rendered.text.includes(`Hi ${expected[0].toUpperCase()}${expected.slice(1)},`),
      `"${name}" should keep its own spelling, got: ${rendered.text.slice(0, 40)}`,
    )
  }
})

test('a missing name falls back to something addressable, never blank', async () => {
  const { renderAdminParticipantEmail } = await import('../src/lib/admin/participant-email.ts')
  const cases: Array<[string | null, string]> = [
    [null, 'hitupstevo@gmail.com'],
    ['', 'ada.b@example.com'],
    ['   ', 'x@y.com'],
  ]
  for (const [name, email] of cases) {
    const rendered = renderAdminParticipantEmail({ template: 'pilot_invite', displayName: name, email })
    assert.doesNotMatch(rendered.html, /Hi ,/, 'an empty greeting must never ship')
    assert.match(rendered.html, /Hi [A-Z]/, 'the fallback should start with a capital')
  }
})
