import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { LANGUAGES, SPEECH_INPUT_OPTIONS } from '../src/lib/languages.ts'
import { CREDIT_GUIDE, BILLING_PLANS } from '../src/lib/billing/catalog.ts'
import { FEATURE_WEIGHTS, estimateCredits, settleCredits } from '../src/lib/billing/credits.ts'
import { CREATE_DOCUMENT_TOOL, shouldOfferDocumentTool } from '../src/lib/chat-tools.ts'
import { EXPORT_MIME, isExportFormat } from '../src/lib/export/render.ts'

/**
 * The marketing page is a promise, and a promise nobody checks becomes a lie by
 * drift rather than by intent. Every claim asserted here is quoted from what a
 * prospective customer actually reads, and checked against the behaviour that
 * is supposed to back it. If a capability is removed or priced, the sentence
 * selling it fails here rather than in front of a customer.
 */

const landing = readFileSync(new URL('../src/components/LandingSections.tsx', import.meta.url), 'utf8')

test('the page still makes the claims this file is guarding', () => {
  // Guards against the claims being quietly reworded, which would make every
  // assertion below pass while testing nothing.
  for (const claim of [
    'It makes the file for you.',
    'Speaks the way Ghana speaks',
    'Survives a dropped line',
    'Projects that remember',
    'The price before it runs',
    'Ends in a real file',
  ]) {
    assert.ok(landing.includes(claim), `the landing page no longer says "${claim}" — update this test with the new wording`)
  }
})

test('"PDF, Word or Excel" — all three formats really are produced', () => {
  assert.ok(landing.includes('PDF, Word or Excel'), 'the lead claim names three formats')
  for (const format of ['pdf', 'docx', 'xlsx'] as const) {
    assert.ok(isExportFormat(format), `${format} is not an accepted export format`)
    assert.ok(EXPORT_MIME[format]?.length > 0, `${format} has no mime type, so it cannot be served`)
  }
  // And the assistant can ask for each of them by name.
  assert.deepEqual(
    [...CREATE_DOCUMENT_TOOL.function.parameters.properties.format.enum],
    ['pdf', 'docx', 'xlsx'],
    'the tool offers a different set of formats than the page advertises',
  )
})

test('"It makes the file for you" — the assistant can genuinely start this itself', () => {
  // The claim is that AI360 produces the file without being asked for a file,
  // so the tool must be reachable from an ordinary request for the work.
  assert.equal(shouldOfferDocumentTool([{ role: 'user', content: 'Make me a wholesale price list I can send to buyers' }]), true)
  assert.equal(CREATE_DOCUMENT_TOOL.function.name, 'create_document')
  // Not for ordinary conversation, or the claim becomes a nuisance.
  assert.equal(shouldOfferDocumentTool([{ role: 'user', content: 'What is shea butter used for?' }]), false)
})

test('"Documents cost nothing at all" — the engine really charges zero', () => {
  assert.ok(landing.includes('Documents cost nothing at all'))
  const weight = FEATURE_WEIGHTS.export
  assert.equal(weight.floor, 0, 'documents have a floor charge, so they are not free')
  assert.equal(weight.reserve, 0, 'documents reserve credits, so they are not free')
  assert.equal(weight.ceiling, 0, 'documents can be charged, so they are not free')
  // And the pricing page says so, rather than leaving it unstated.
  const row = CREDIT_GUIDE.find((item) => /PDF, Word and Excel/i.test(item.task))
  assert.ok(row, 'the pricing page does not mention documents at all')
  assert.match(row.credits, /^included/i, `the pricing page prices documents at "${row?.credits}"`)
})

test('"refunded in full if it fails" — a failed task charges nothing', () => {
  assert.ok(landing.includes('refunded in full if it fails'))
  // Every metered feature, not just the convenient one.
  for (const feature of ['image', 'video', 'agent', 'chat.research', 'chat.premium'] as const) {
    const estimate = estimateCredits(feature)
    const settlement = settleCredits({ estimate, measuredUsd: 0.05, outcome: 'failure' })
    assert.equal(settlement.charged, 0, `${feature} charges ${settlement.charged} credits for failed work`)
    assert.equal(settlement.released, estimate.reserve, `${feature} does not release its whole reservation on failure`)
  }
})

test('"quoted first" — nothing can cost more than the person was shown', () => {
  assert.ok(landing.includes('The price before it runs'))
  // Even when the measured cost comes back far above the reservation, the
  // charge is capped at what was reserved and shown.
  const estimate = estimateCredits('video', { quotedUsd: 0.05 })
  const settlement = settleCredits({ estimate, measuredUsd: 99, outcome: 'success' })
  assert.ok(
    settlement.charged <= estimate.reserve,
    `a video charged ${settlement.charged} credits against a quote of ${estimate.reserve}`,
  )
  assert.equal(settlement.cappedByCeiling, true, 'the overrun was not recorded as capped')
})

test('"English, Twi, Gã, Eʋegbe and Pidgin" — each one is really offered', () => {
  const claimed = ['English', 'Twi', 'Gã', 'Eʋegbe', 'Pidgin']
  const nativeNames = LANGUAGES.map((language) => language.nativeName)
  for (const name of claimed) {
    assert.ok(nativeNames.includes(name), `the page advertises ${name} but it is not in LANGUAGES`)
  }
  assert.equal(LANGUAGES.length, claimed.length, 'the page and the product disagree on how many languages exist')
})

test('"Type it, or say it out loud" — voice input covers the languages named', () => {
  assert.ok(landing.includes('say it out loud'))
  const spoken = new Set(SPEECH_INPUT_OPTIONS.map((option) => option.code))
  for (const language of LANGUAGES) {
    assert.ok(spoken.has(language.code), `${language.nativeName} can be written but not spoken, so the claim overreaches`)
  }
})

test('"Projects that remember" — a project really holds brief, files and chats', () => {
  assert.ok(landing.includes('its brief, its files and its own conversations'))
  // The conversation link is the newest of the three and the easiest to lose.
  const migration = readFileSync(
    new URL('../database/postgres/0018_project_conversations.sql', import.meta.url), 'utf8',
  )
  assert.match(migration, /add column if not exists project_id/, 'conversations cannot belong to a project')
  assert.match(migration, /on delete set null/i, 'deleting a project would destroy its conversations')
})

test('"Survives a dropped line" — unfinished work can genuinely be resumed', () => {
  assert.ok(landing.includes('still running when you come back'))
  // A run has to be addressable after the connection carrying it has gone.
  const recovery = readFileSync(
    new URL('../src/app/api/agent/runs/[runId]/route.ts', import.meta.url), 'utf8',
  )
  assert.ok(recovery.length > 0, 'there is no route to pick a run back up')
  // And a video render has to survive the browser being closed entirely.
  const studio = readFileSync(new URL('../src/components/MediaStudio.tsx', import.meta.url), 'utf8')
  assert.match(studio, /sessionStorage/, 'a render in flight is not stored anywhere the browser can recover it')
  assert.match(studio, /visibilitychange/, 'a backgrounded tab never resumes polling')
})

test('"Ends in a real file" — the proof strip names what it delivers', () => {
  assert.ok(landing.includes('Ends in a real file'))
  assert.ok(
    /PDF, Word and Excel files, images and video/.test(landing),
    'the proof strip promises files without naming them',
  )
})

test('every paid plan named on the pricing page still exists in the catalogue', () => {
  // The landing page routes people to /pricing; the plans behind it must be real.
  const slugs = BILLING_PLANS.map((plan) => plan.slug)
  for (const slug of ['explorer', 'everyday', 'builder', 'team']) {
    assert.ok(slugs.includes(slug as never), `${slug} is advertised but no longer in the catalogue`)
  }
})
