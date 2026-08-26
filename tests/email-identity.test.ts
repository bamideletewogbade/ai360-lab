import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalEmail,
  candidateDomains,
  isSameMailbox,
  resolveInvitationForEmail,
} from '../src/lib/admin/email-identity.ts'

test('the failure that stranded the first test invitation is fixed', () => {
  // Invited as bamstewo+t1@gmail.com; Google returned bamstewo@gmail.com, the
  // exact-match lookup found nothing, and the person got an account with no
  // credits and no membership.
  assert.equal(isSameMailbox('bamstewo+t1@gmail.com', 'bamstewo@gmail.com'), true)
  const resolved = resolveInvitationForEmail('bamstewo@gmail.com', [
    { email: 'bamstewo+t1@gmail.com' },
  ])
  assert.ok(resolved.match)
  assert.equal(resolved.match.email, 'bamstewo+t1@gmail.com')
})

test('Google addresses reduce to the inbox Google actually delivers to', () => {
  assert.equal(canonicalEmail('John.Doe+pilot@Gmail.com'), 'johndoe@gmail.com')
  assert.equal(canonicalEmail('j.o.h.n.d.o.e@googlemail.com'), 'johndoe@gmail.com')
  assert.equal(isSameMailbox('john.doe@gmail.com', 'johndoe@googlemail.com'), true)
})

test('dots stay significant everywhere except Google', () => {
  // Two different people at most providers. Treating them as one would hand
  // somebody else's credits over.
  assert.notEqual(canonicalEmail('john.doe@outlook.com'), canonicalEmail('johndoe@outlook.com'))
  assert.equal(isSameMailbox('john.doe@yahoo.com', 'johndoe@yahoo.com'), false)
  assert.equal(isSameMailbox('a.b@kulendilaw.com.gh', 'ab@kulendilaw.com.gh'), false)
})

test('sub-addressing is stripped only where the provider documents it', () => {
  assert.equal(canonicalEmail('ada+pilot@outlook.com'), 'ada@outlook.com')
  assert.equal(canonicalEmail('ada+pilot@icloud.com'), 'ada@icloud.com')
  assert.equal(canonicalEmail('ada+pilot@yahoo.com'), 'ada@yahoo.com')
  // An unknown corporate domain may treat `+` as an ordinary character, so it
  // is left alone rather than assumed.
  assert.equal(canonicalEmail('ada+pilot@kulendilaw.com.gh'), 'ada+pilot@kulendilaw.com.gh')
})

test('different mailboxes are never matched, however similar', () => {
  // The realistic cohort case: invited on Yahoo, signs in with Google.
  assert.equal(isSameMailbox('robertlamptey809@yahoo.com', 'robertlamptey809@gmail.com'), false)
  assert.equal(isSameMailbox('ada@gmail.com', 'adah@gmail.com'), false)
  assert.equal(isSameMailbox('ada@gmail.com', 'ada@company.com'), false)
  const resolved = resolveInvitationForEmail('someone@gmail.com', [
    { email: 'different@yahoo.com' },
  ])
  assert.equal(resolved.match, null)
})

test('two open invitations reaching one inbox are refused, not guessed between', () => {
  const resolved = resolveInvitationForEmail('ada@gmail.com', [
    { email: 'ada+one@gmail.com' },
    { email: 'a.d.a+two@gmail.com' },
  ])
  assert.equal(resolved.match, null)
  assert.ok(!resolved.match)
  assert.equal(resolved.reason, 'ambiguous')
})

test('an exact match always wins over a canonical one', () => {
  const resolved = resolveInvitationForEmail('ada@gmail.com', [
    { email: 'ada+tag@gmail.com' },
    { email: 'ada@gmail.com' },
  ])
  assert.ok(resolved.match)
  assert.equal(resolved.match.email, 'ada@gmail.com')
})

test('the candidate lookup stays bounded to domains that could match', () => {
  assert.deepEqual(candidateDomains('ada@yahoo.com'), ['yahoo.com'])
  const google = candidateDomains('ada@googlemail.com')
  assert.equal(google.length, 2)
  assert.ok(google.includes('gmail.com') && google.includes('googlemail.com'))
  assert.deepEqual(candidateDomains('nonsense'), [])
})

test('malformed input is refused rather than canonicalised into something', () => {
  for (const bad of ['', '   ', 'no-at-sign', 'a@b', '@gmail.com', '+tag@gmail.com', 'a@', null, 42, {}]) {
    assert.equal(canonicalEmail(bad), null, `${JSON.stringify(bad)} must not canonicalise`)
  }
  assert.equal(isSameMailbox(null, null), false)
  assert.equal(isSameMailbox('', ''), false)
})

test('a quoted local part is left exactly as written', () => {
  // Dots and plus signs inside quotes are literal, not sub-addressing.
  assert.equal(canonicalEmail('"odd.name+here"@example.com'), '"odd.name+here"@example.com')
})

test('case and surrounding whitespace never decide a match', () => {
  assert.equal(isSameMailbox('  ADA@Gmail.COM ', 'ada@gmail.com'), true)
  assert.equal(canonicalEmail(' Ada+X@GoogleMail.com '), 'ada@gmail.com')
})
