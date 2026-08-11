import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_TASKS, ONBOARDING_GOALS, ONBOARDING_ROLES, SKIPPED,
  parseProfile, personalizedIntro, personalizedTasks, readStoredProfile, resolveFirstRun,
} from '../src/lib/onboarding.ts'

const PROFILE = { role: 'entrepreneur', goal: 'business' } as const
const RAW = JSON.stringify(PROFILE)

test('every goal yields four concrete suggested prompts', () => {
  for (const goal of ONBOARDING_GOALS) {
    const tasks = personalizedTasks({ role: 'student', goal: goal.id })
    assert.equal(tasks.length, 4, `${goal.id} should offer four prompts`)
    for (const task of tasks) {
      assert.ok(task.label && task.prompt, `${goal.id} task must have a label and prompt`)
    }
  }
})

test('the goal changes the prompts, so personalization is real', () => {
  const learn = personalizedTasks({ role: 'student', goal: 'learn' })
  const business = personalizedTasks({ role: 'entrepreneur', goal: 'business' })
  assert.notDeepEqual(learn.map((t) => t.label), business.map((t) => t.label))
})

test('a missing profile falls back to the general task set', () => {
  assert.deepEqual(personalizedTasks(null), DEFAULT_TASKS)
})

test('a stored profile round-trips and a malformed one is rejected', () => {
  assert.deepEqual(parseProfile({ role: 'entrepreneur', goal: 'business' }), { role: 'entrepreneur', goal: 'business' })
  assert.equal(parseProfile({ role: 'wizard', goal: 'business' }), null)
  assert.equal(parseProfile({ role: 'student' }), null)
  assert.equal(parseProfile(null), null)
  assert.equal(parseProfile('student'), null)
})

test('the intro is role-aware but always returns a usable line', () => {
  const withProfile = personalizedIntro({ role: 'entrepreneur', goal: 'business' })
  assert.match(withProfile, /entrepreneur/)
  assert.ok(personalizedIntro(null).length > 0)
})

test('roles and goals are distinct and complete', () => {
  assert.equal(new Set(ONBOARDING_ROLES.map((r) => r.id)).size, ONBOARDING_ROLES.length)
  assert.equal(new Set(ONBOARDING_GOALS.map((g) => g.id)).size, ONBOARDING_GOALS.length)
})

test('a raw stored value reads back as a profile only when it is well formed', () => {
  assert.deepEqual(readStoredProfile(RAW), PROFILE)
  assert.equal(readStoredProfile(SKIPPED), null)
  assert.equal(readStoredProfile(null), null)
  assert.equal(readStoredProfile('{ not json'), null)
  assert.equal(readStoredProfile(JSON.stringify({ role: 'wizard', goal: 'business' })), null)
})

test('a brand-new guest is offered the intake', () => {
  const decision = resolveFirstRun({ scopedRaw: null, guestRaw: null, signedIn: false, isGuestScope: true })
  assert.deepEqual(decision, { profile: null, showIntake: true, adopt: null })
})

test('a returning guest keeps their choice and is not re-asked', () => {
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: RAW, guestRaw: RAW, signedIn: false, isGuestScope: true }),
    { profile: PROFILE, showIntake: false, adopt: null },
  )
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: SKIPPED, guestRaw: SKIPPED, signedIn: false, isGuestScope: true }),
    { profile: null, showIntake: false, adopt: null },
  )
})

test('signing in adopts the guest choice made on this device, once', () => {
  // A profile chosen as a guest follows the person into their account.
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: null, guestRaw: RAW, signedIn: true, isGuestScope: false }),
    { profile: PROFILE, showIntake: false, adopt: PROFILE },
  )
  // A guest who declined is not nagged again right after signing up.
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: null, guestRaw: SKIPPED, signedIn: true, isGuestScope: false }),
    { profile: null, showIntake: false, adopt: SKIPPED },
  )
})

test('a new identity with nothing to inherit still gets its own intake', () => {
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: null, guestRaw: null, signedIn: true, isGuestScope: false }),
    { profile: null, showIntake: true, adopt: null },
  )
})

test('an identity keeps its own record and never inherits from a shared device', () => {
  // This identity already answered, so a different guest profile on the same
  // device must not override it — no leakage between people sharing a browser.
  const other = JSON.stringify({ role: 'student', goal: 'learn' })
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: RAW, guestRaw: other, signedIn: true, isGuestScope: false }),
    { profile: PROFILE, showIntake: false, adopt: null },
  )
  // An identity that explicitly skipped is respected over any guest profile.
  assert.deepEqual(
    resolveFirstRun({ scopedRaw: SKIPPED, guestRaw: other, signedIn: true, isGuestScope: false }),
    { profile: null, showIntake: false, adopt: null },
  )
})
