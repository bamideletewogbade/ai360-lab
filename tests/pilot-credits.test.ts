import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizePilotCohort,
  parsePilotCreditCsv,
  pilotGrantIdempotencyKey,
} from '../src/lib/billing/pilot-credits.ts'

test('pilot CSV grants the default amount and permits deliberate per-user overrides', () => {
  const rows = parsePilotCreditCsv('\uFEFFemail,credits\r\nOne@Example.com,\r\ntwo@example.com,150\r\n')
  assert.deepEqual(rows, [
    { rowNumber: 2, email: 'one@example.com', credits: 100 },
    { rowNumber: 3, email: 'two@example.com', credits: 150 },
  ])
})

test('pilot CSV accepts quoted fields without weakening email validation', () => {
  const rows = parsePilotCreditCsv('email,credits,notes\n"person+pilot@example.com","75","media, video"')
  assert.equal(rows[0].email, 'person+pilot@example.com')
  assert.equal(rows[0].credits, 75)
})

test('pilot CSV rejects duplicate accounts before any grant can start', () => {
  assert.throws(
    () => parsePilotCreditCsv('email\nTester@Example.com\ntester@example.com'),
    /repeat tester@example\.com/,
  )
})

test('pilot CSV rejects malformed emails and unsafe credit amounts', () => {
  assert.throws(() => parsePilotCreditCsv('email\nnot-an-email'), /invalid email/)
  assert.throws(() => parsePilotCreditCsv('email,credits\npilot@example.com,0'), /between 1 and/)
  assert.throws(() => parsePilotCreditCsv('email,credits\npilot@example.com,2.5'), /whole number/)
})

test('pilot CSV caps the batch size', () => {
  const input = `email\n${Array.from({ length: 101 }, (_, index) => `person${index}@example.com`).join('\n')}`
  assert.throws(() => parsePilotCreditCsv(input), /between 1 and 100 users/)
})

test('pilot cohorts produce stable retry keys and reject unsafe labels', () => {
  assert.equal(normalizePilotCohort(' Pilot-2026-09 '), 'pilot-2026-09')
  assert.equal(pilotGrantIdempotencyKey('pilot-2026-09'), 'pilot:pilot-2026-09')
  assert.throws(() => normalizePilotCohort('Pilot September!'), /Cohort must be/)
})
