import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MAX_VOICE_BYTES, parseTranscriptionForm, voiceFormatForMime,
} from '../src/lib/voice/contracts.ts'

const appPage = readFileSync(new URL('../src/app/app/page.tsx', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../src/components/PromptComposer.tsx', import.meta.url), 'utf8')
const privacy = readFileSync(new URL('../src/app/privacy/page.tsx', import.meta.url), 'utf8')

test('voice formats normalize browser codec parameters', () => {
  assert.equal(voiceFormatForMime('audio/webm;codecs=opus'), 'webm')
  assert.equal(voiceFormatForMime('audio/ogg'), 'ogg')
  assert.equal(voiceFormatForMime('video/mp4'), undefined)
})

test('multipart voice input keeps language context separate', () => {
  const form = new FormData()
  form.set('audio', new File(['voice'], 'note.webm', { type: 'audio/webm;codecs=opus' }))
  form.set('inputLanguage', 'tw')
  form.set('durationSeconds', '14')
  const parsed = parseTranscriptionForm(form)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.value.inputLanguage, 'tw')
    assert.equal(parsed.value.format, 'webm')
    assert.equal(parsed.value.durationSeconds, 14)
  }
})

test('voice input rejects empty, oversized and overlong recordings', () => {
  const empty = new FormData()
  assert.deepEqual(parseTranscriptionForm(empty).ok, false)

  const oversized = new FormData()
  oversized.set('audio', new File([new Uint8Array(MAX_VOICE_BYTES + 1)], 'large.wav', { type: 'audio/wav' }))
  const oversizedResult = parseTranscriptionForm(oversized)
  assert.equal(oversizedResult.ok, false)
  if (!oversizedResult.ok) assert.equal(oversizedResult.status, 413)

  const overlong = new FormData()
  overlong.set('audio', new File(['voice'], 'note.ogg', { type: 'audio/ogg' }))
  overlong.set('durationSeconds', '400')
  assert.equal(parseTranscriptionForm(overlong).ok, false)
})

test('stopping a recording starts transcription without another confirmation click', () => {
  assert.match(appPage, /recorder\.onstop[\s\S]*void transcribeRecording\(blob, duration\)/)
  assert.doesNotMatch(composer, /Use transcript/)
  assert.match(composer, /Transcribing voice/)
  assert.match(composer, /aria-label="Cancel transcription"/)
})

test('a failed automatic transcription keeps the recording available for retry', () => {
  assert.match(composer, /Could not transcribe/)
  assert.match(composer, /onClick=\{onRetryTranscription\}>Retry/)
  assert.match(appPage, /setRecordingState\('recorded'\)/)
})

test('voice capture ignores stale permission requests and empty recordings', () => {
  assert.match(appPage, /recordingGenerationRef\.current !== recordingGeneration/)
  assert.match(appPage, /if \(!blob\.size\)/)
  assert.match(appPage, /No audio was captured/)
})

test('the privacy explanation matches automatic voice processing', () => {
  assert.match(privacy, /stop a voice recording, it is sent automatically/)
  assert.match(privacy, /does not save a copy of the raw audio/)
})
