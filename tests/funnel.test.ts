import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FUNNEL_STEPS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  FUNNEL_INVITATION_PARAM,
  biggestDropOff,
  isFunnelStep,
  isVisitorKey,
  normalizeInvitationId,
  parseFunnelEvent,
  referrerHost,
  summarizeFunnel,
  timeToFirstValueMinutes,
} from '../src/lib/funnel/contract.ts'
import { safeInternalPath } from '../src/lib/auth-callback.ts'

test('the funnel covers the journey from invitation click to a return visit', () => {
  assert.deepEqual(FUNNEL_STEPS, [
    'invite_clicked', 'landing_viewed', 'signup_started', 'signup_completed', 'workspace_entered',
  ])
  // Every stage must be nameable to a person; an unlabelled stage renders blank.
  for (const stage of FUNNEL_STAGES) {
    assert.ok(FUNNEL_STAGE_LABELS[stage]?.length > 3, `${stage} needs a label`)
  }
  assert.equal(FUNNEL_STAGES.at(-1), 'returned')
})

test('only a known step is accepted, so a forged call cannot invent a stage', () => {
  const key = 'a'.repeat(32)
  for (const bad of ['purchased', '', 'DROP TABLE', null, 42]) {
    assert.equal(isFunnelStep(bad), false)
    const parsed = parseFunnelEvent({ step: bad, visitorKey: key })
    assert.equal(parsed.ok, false)
  }
  assert.equal(parseFunnelEvent({ step: 'landing_viewed', visitorKey: key }).ok, true)
})

test('a visitor key is bounded, so a forged one cannot become a storage problem', () => {
  assert.equal(isVisitorKey('a'.repeat(32)), true)
  for (const bad of ['short', 'a'.repeat(65), 'has spaces', 'semi;colon', '', null, {}]) {
    assert.equal(isVisitorKey(bad), false, `${JSON.stringify(bad)} must be refused`)
  }
})

test('an invitation id is accepted only in the shape the system mints', () => {
  const real = `invitation_${'0123abcd-4567-89ef-0123-456789abcdef'}`
  assert.equal(normalizeInvitationId(real), real)
  assert.equal(normalizeInvitationId(real.toUpperCase()), real)
  for (const bad of ['invitation_nope', 'invitation_', '../../etc', '', null, 7]) {
    assert.equal(normalizeInvitationId(bad), null)
  }
})

test('a referrer is reduced to its host, because query strings carry personal data', () => {
  assert.equal(referrerHost('https://mail.google.com/mail/u/0?token=SECRET'), 'mail.google.com')
  assert.equal(referrerHost('https://WWW.Facebook.com/'), 'www.facebook.com')
  for (const bad of ['not a url', '', null, undefined, 12]) {
    assert.equal(referrerHost(bad), null)
  }
})

test('a parsed event never carries anything the person typed', () => {
  const parsed = parseFunnelEvent({
    step: 'landing_viewed',
    visitorKey: 'b'.repeat(32),
    surface: 'mobile',
    referrer: 'https://mail.google.com/mail?q=private',
    // Fields nobody should be able to smuggle in.
    prompt: 'my confidential business plan',
    email: 'someone@example.com',
    userId: 'user_pretend_to_be_someone_else',
  })
  assert.ok(parsed.ok)
  assert.deepEqual(Object.keys(parsed.event).sort(), [
    'invitationId', 'referrerHost', 'step', 'surface', 'visitorKey',
  ])
  assert.equal(JSON.stringify(parsed.event).includes('confidential'), false)
  assert.equal(JSON.stringify(parsed.event).includes('example.com'), false)
})

test('a funnel never shows a later stage as wider than an earlier one', () => {
  // A landing event lost to an ad blocker would otherwise make the funnel
  // report more sign-ups than visitors, which reads as broken data.
  const stages = summarizeFunnel({
    invite_clicked: 0,
    landing_viewed: 2,
    signup_started: 40,
    signup_completed: 30,
    workspace_entered: 28,
    first_prompt: 25,
    first_outcome: 20,
    first_export: 8,
    returned: 6,
  })
  for (let index = 1; index < stages.length; index += 1) {
    assert.ok(
      stages[index].people <= stages[index - 1].people,
      `${stages[index].stage} (${stages[index].people}) exceeds ${stages[index - 1].stage} (${stages[index - 1].people})`,
    )
  }
  assert.equal(stages[0].people, 40)
  assert.equal(stages[0].percentOfStart, 100)
})

test('percentages describe both the whole funnel and the step just before', () => {
  const stages = summarizeFunnel({
    invite_clicked: 100, landing_viewed: 100, signup_started: 50,
    signup_completed: 25, workspace_entered: 25,
    first_prompt: 25, first_outcome: 25, first_export: 25, returned: 25,
  })
  const signup = stages.find((stage) => stage.stage === 'signup_completed')!
  assert.equal(signup.percentOfStart, 25)
  assert.equal(signup.percentOfPrevious, 50)
})

test('an empty funnel reports zeroes rather than dividing by zero', () => {
  const stages = summarizeFunnel({})
  assert.equal(stages.length, FUNNEL_STAGES.length)
  for (const stage of stages) {
    assert.equal(stage.people, 0)
    assert.equal(stage.percentOfStart, 0)
    assert.equal(stage.percentOfPrevious, 0)
  }
  assert.equal(biggestDropOff(stages), null)
})

test('the biggest drop-off names the step worth fixing first', () => {
  const stages = summarizeFunnel({
    invite_clicked: 63, landing_viewed: 60, signup_started: 55,
    // The cliff: most people who start signing up never finish.
    signup_completed: 20, workspace_entered: 19,
    first_prompt: 18, first_outcome: 17, first_export: 9, returned: 7,
  })
  assert.equal(biggestDropOff(stages)?.stage, 'signup_completed')
})

test('time to first value is measured, and refuses impossible readings', () => {
  assert.equal(timeToFirstValueMinutes({
    arrivedAt: '2026-09-01T10:00:00.000Z',
    firstOutcomeAt: '2026-09-01T10:07:30.000Z',
  }), 7.5)
  // An outcome cannot precede the arrival that led to it.
  assert.equal(timeToFirstValueMinutes({
    arrivedAt: '2026-09-01T10:00:00.000Z',
    firstOutcomeAt: '2026-09-01T09:00:00.000Z',
  }), null)
  assert.equal(timeToFirstValueMinutes({ arrivedAt: null, firstOutcomeAt: '2026-09-01T10:00:00.000Z' }), null)
  assert.equal(timeToFirstValueMinutes({ arrivedAt: '2026-09-01T10:00:00.000Z', firstOutcomeAt: null }), null)
})

test('the invitation id survives the auth callback round trip', () => {
  // The invite link sends people through Supabase, which returns them to
  // /auth/callback?next=<path>. If the callback dropped the query string the
  // whole cohort would arrive unattributed, and the funnel could not name
  // anybody who stalled.
  const id = `invitation_${'0123abcd-4567-89ef-0123-456789abcdef'}`
  const landing = `/app?${FUNNEL_INVITATION_PARAM}=${encodeURIComponent(id)}`
  const survived = safeInternalPath(landing)
  assert.equal(survived, landing)
  assert.equal(new URL(survived, 'https://ai360.africa').searchParams.get(FUNNEL_INVITATION_PARAM), id)
})

test('the callback still refuses to leave the site', () => {
  assert.equal(safeInternalPath('https://evil.example/app?i=x'), '/app')
  assert.equal(safeInternalPath('//evil.example'), '/app')
})
