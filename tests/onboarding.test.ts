import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_TASKS, ONBOARDING_GOALS, ONBOARDING_ROLES,
  parseProfile, personalizedIntro, personalizedTasks,
} from '../src/lib/onboarding.ts'

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
