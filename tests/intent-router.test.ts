import assert from 'node:assert/strict'
import test from 'node:test'
import { routeIntentDeterministically } from '../src/lib/intent-router.ts'

test('clear project outcomes enter the durable project surface', () => {
  assert.equal(routeIntentDeterministically('Help me launch a campaign for my new drink').route, 'project')
})

test('changing facts use research while ordinary help stays in chat', () => {
  assert.equal(routeIntentDeterministically('Compare the latest mobile money prices').route, 'research')
  assert.equal(routeIntentDeterministically('Make this paragraph easier to understand').route, 'chat')
})

test('mixed signals are marked for evaluation without removing the fallback', () => {
  const result = routeIntentDeterministically('Research the market and build an ad campaign')
  assert.equal(result.route, 'project')
  assert.equal(result.ambiguous, true)
  assert.deepEqual(result.signals, ['project', 'research'])
})

test('long outcome descriptions are eligible for shadow routing', () => {
  const result = routeIntentDeterministically('I have an idea for busy parents in Accra and I want something useful I can take to them next month')
  assert.equal(result.route, 'chat')
  assert.equal(result.ambiguous, true)
})
