import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_IMPORT_ROWS,
  normalizeEmail,
  parseParticipantList,
} from '@/lib/admin/participant-import'

test('a CSV saved out of Excel keeps its name and cohort columns', () => {
  const result = parseParticipantList(
    'Email,Full name,Cohort\nAda@Example.com,Ada Lovelace,pilot-main\nlin@example.com,Lin Chen,pilot-two\n',
  )
  assert.equal(result.format, 'csv')
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.rows, [
    { email: 'ada@example.com', displayName: 'Ada Lovelace', cohortKey: 'pilot-main', line: 2 },
    { email: 'lin@example.com', displayName: 'Lin Chen', cohortKey: 'pilot-two', line: 3 },
  ])
})

test('a semicolon export from a non-English locale parses the same way', () => {
  const result = parseParticipantList('E-mail;Name\nada@example.com;Ada\nlin@example.com;Lin\n')
  assert.equal(result.format, 'csv')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com', 'lin@example.com'])
  assert.deepEqual(result.rows.map((row) => row.displayName), ['Ada', 'Lin'])
})

test('the Excel byte-order mark does not corrupt the header', () => {
  const result = parseParticipantList('﻿Email,Name\nada@example.com,Ada\n')
  assert.equal(result.format, 'csv')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com'])
})

test('quoted fields may carry the delimiter and an escaped quote', () => {
  const result = parseParticipantList('Email,Name\nada@example.com,"Lovelace, Ada ""Countess"""\n')
  assert.equal(result.rows[0].displayName, 'Lovelace, Ada "Countess"')
})

test('a headerless paste treats every line as an address', () => {
  const result = parseParticipantList('ada@example.com\nlin@example.com\n')
  assert.equal(result.format, 'list')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com', 'lin@example.com'])
  assert.deepEqual(result.rows.map((row) => row.line), [1, 2])
})

test('a headerless file does not lose its first participant to header detection', () => {
  const result = parseParticipantList('ada@example.com,Ada\nlin@example.com,Lin\n')
  assert.equal(result.format, 'list')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com', 'lin@example.com'])
})

test('addresses copied out of a mail client keep their display name', () => {
  const result = parseParticipantList('Ada Lovelace <Ada@Example.com>\n"Lin Chen" <lin@example.com>\n')
  assert.deepEqual(result.rows, [
    { email: 'ada@example.com', displayName: 'Ada Lovelace', cohortKey: null, line: 1 },
    { email: 'lin@example.com', displayName: 'Lin Chen', cohortKey: null, line: 2 },
  ])
})

test('one line of comma-separated addresses is a whole list', () => {
  const result = parseParticipantList('ada@example.com, lin@example.com; sam@example.com')
  assert.deepEqual(result.rows.map((row) => row.email), [
    'ada@example.com', 'lin@example.com', 'sam@example.com',
  ])
})

test('paste debris is stripped rather than rejected', () => {
  assert.equal(normalizeEmail('mailto:Ada@Example.com'), 'ada@example.com')
  assert.equal(normalizeEmail('  ada@example.com,  '), 'ada@example.com')
  assert.equal(normalizeEmail('<ada@example.com>'), 'ada@example.com')
  assert.equal(normalizeEmail('"ada@example.com";'), 'ada@example.com')
})

test('malformed addresses are refused rather than guessed at', () => {
  assert.equal(normalizeEmail('ada@example'), null)
  assert.equal(normalizeEmail('ada@@example.com'), null)
  assert.equal(normalizeEmail('ada@example..com'), null)
  assert.equal(normalizeEmail('.ada@example.com'), null)
  assert.equal(normalizeEmail('ada.@example.com'), null)
  assert.equal(normalizeEmail('ada example.com'), null)
  assert.equal(normalizeEmail('@example.com'), null)
  assert.equal(normalizeEmail(''), null)
  assert.equal(normalizeEmail(`${'a'.repeat(65)}@example.com`), null)
})

test('a bad row is reported against the line the operator can see', () => {
  const result = parseParticipantList('Email,Name\nada@example.com,Ada\nnot-an-address,Bo\nlin@example.com,Lin\n')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com', 'lin@example.com'])
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].reason, 'invalid_email')
  assert.equal(result.issues[0].line, 3)
})

test('a repeated address is kept once and flagged, regardless of case', () => {
  const result = parseParticipantList('ada@example.com\nADA@Example.com\n')
  assert.equal(result.rows.length, 1)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].reason, 'duplicate_in_file')
  assert.equal(result.issues[0].line, 2)
})

test('a row with other columns but no address is an operator mistake, an empty row is not', () => {
  const result = parseParticipantList('Email,Name\n,Bo\n,\nada@example.com,Ada\n')
  assert.deepEqual(result.rows.map((row) => row.email), ['ada@example.com'])
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].reason, 'missing_email')
  assert.equal(result.issues[0].line, 2)
})

test('an oversized list is truncated and says so', () => {
  const lines = Array.from({ length: MAX_IMPORT_ROWS + 25 }, (_, index) => `person${index}@example.com`)
  const result = parseParticipantList(lines.join('\n'))
  assert.equal(result.rows.length, MAX_IMPORT_ROWS)
  assert.equal(result.truncated, true)
})

test('a list within the cap is not marked truncated', () => {
  const result = parseParticipantList('ada@example.com\nlin@example.com')
  assert.equal(result.truncated, false)
})

test('a cohort column too short to be stored is dropped, not passed through', () => {
  const result = parseParticipantList('Email,Cohort\nada@example.com,x\nlin@example.com,pilot-main\n')
  assert.equal(result.rows[0].cohortKey, null)
  assert.equal(result.rows[1].cohortKey, 'pilot-main')
})

test('empty input produces nothing rather than throwing', () => {
  const result = parseParticipantList('')
  assert.deepEqual(result.rows, [])
  assert.deepEqual(result.issues, [])
  assert.equal(result.truncated, false)
})
