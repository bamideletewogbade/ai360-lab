import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pilotReadiness, summarizeVoiceEvaluation, transcriptionErrorRate, type VoiceEvaluationObservation,
} from '../src/lib/voice/evaluation.ts'

test('voice evaluation calculates word and character error without losing Unicode', () => {
  assert.equal(transcriptionErrorRate('Meda wo ase', 'Meda ase', 'word'), 1 / 3)
  assert.equal(transcriptionErrorRate('Eʋegbe', 'Eʋegbe', 'character'), 0)
})

test('voice evaluation keeps task meaning and Ghanaian entity accuracy visible', () => {
  const observations: VoiceEvaluationObservation[] = [{
    clipId: 'tw-001', language: 'tw', environment: 'busy-public',
    reference: 'Pay Ama at OmniBSIC', transcript: 'Pay Ama at OmniBSIC',
    expectedEntities: ['Ama', 'OmniBSIC'], latencyMs: 1200,
    taskMeaningPreserved: true, nativeSpeakerApproved: true, codeSwitched: true,
  }]
  const summary = summarizeVoiceEvaluation(observations)
  assert.equal(summary.entityRecall, 1)
  assert.equal(summary.taskMeaningPreservedRate, 1)
  assert.equal(summary.includesCodeSwitching, true)
})

test('a small happy-path demo cannot be called production-ready', () => {
  const summary = summarizeVoiceEvaluation([{
    clipId: 'en-001', language: 'en', environment: 'quiet', reference: 'hello', transcript: 'hello',
    latencyMs: 300, taskMeaningPreserved: true, nativeSpeakerApproved: true,
  }])
  const readiness = pilotReadiness(summary)
  assert.equal(readiness.ready, false)
  assert.match(readiness.reasons.join(' '), /50 validated clips/)
  assert.match(readiness.reasons.join(' '), /Code-switched/)
})
