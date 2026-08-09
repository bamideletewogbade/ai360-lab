import type { SpeechInputCode } from '@/lib/languages'

export const REQUIRED_EVALUATION_ENVIRONMENTS = [
  'quiet', 'office', 'outdoor', 'busy-public',
] as const
export type EvaluationEnvironment = typeof REQUIRED_EVALUATION_ENVIRONMENTS[number]

export type VoiceEvaluationObservation = {
  clipId: string
  language: Exclude<SpeechInputCode, 'mixed'>
  environment: EvaluationEnvironment
  reference: string
  transcript: string
  expectedEntities?: string[]
  latencyMs: number
  taskMeaningPreserved: boolean
  nativeSpeakerApproved: boolean
  codeSwitched?: boolean
  impairedSpeech?: boolean
}

export type VoiceEvaluationSummary = {
  clips: number
  wordErrorRate: number
  characterErrorRate: number
  entityRecall: number | null
  taskMeaningPreservedRate: number
  nativeSpeakerApprovalRate: number
  p95LatencyMs: number
  environments: EvaluationEnvironment[]
  includesCodeSwitching: boolean
  includesImpairedSpeech: boolean
}

function units(text: string, kind: 'word' | 'character') {
  const normalized = text.normalize('NFKC').trim().toLocaleLowerCase()
  return kind === 'word' ? normalized.split(/\s+/u).filter(Boolean) : Array.from(normalized.replace(/\s/gu, ''))
}

function editDistance(reference: string[], hypothesis: string[]) {
  const previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index)
  for (let row = 1; row <= reference.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= hypothesis.length; column += 1) {
      const above = previous[column]
      previous[column] = reference[row - 1] === hypothesis[column - 1]
        ? diagonal
        : 1 + Math.min(diagonal, previous[column - 1], above)
      diagonal = above
    }
  }
  return previous[hypothesis.length]
}

export function transcriptionErrorRate(reference: string, hypothesis: string, kind: 'word' | 'character') {
  const expected = units(reference, kind)
  const actual = units(hypothesis, kind)
  if (!expected.length) return actual.length ? 1 : 0
  return editDistance(expected, actual) / expected.length
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)]
}

function containsEntity(transcript: string, entity: string) {
  return transcript.normalize('NFKC').toLocaleLowerCase().includes(entity.normalize('NFKC').toLocaleLowerCase())
}

export function summarizeVoiceEvaluation(observations: VoiceEvaluationObservation[]): VoiceEvaluationSummary {
  const wordUnits = observations.reduce((total, item) => total + Math.max(1, units(item.reference, 'word').length), 0)
  const characterUnits = observations.reduce((total, item) => total + Math.max(1, units(item.reference, 'character').length), 0)
  const wordErrors = observations.reduce((total, item) =>
    total + transcriptionErrorRate(item.reference, item.transcript, 'word') * Math.max(1, units(item.reference, 'word').length), 0)
  const characterErrors = observations.reduce((total, item) =>
    total + transcriptionErrorRate(item.reference, item.transcript, 'character') * Math.max(1, units(item.reference, 'character').length), 0)
  const entities = observations.flatMap((item) => (item.expectedEntities || []).map((entity) => ({ entity, transcript: item.transcript })))
  const approved = observations.filter((item) => item.nativeSpeakerApproved).length
  const preserved = observations.filter((item) => item.taskMeaningPreserved).length

  return {
    clips: observations.length,
    wordErrorRate: observations.length ? wordErrors / wordUnits : 0,
    characterErrorRate: observations.length ? characterErrors / characterUnits : 0,
    entityRecall: entities.length
      ? entities.filter(({ entity, transcript }) => containsEntity(transcript, entity)).length / entities.length
      : null,
    taskMeaningPreservedRate: observations.length ? preserved / observations.length : 0,
    nativeSpeakerApprovalRate: observations.length ? approved / observations.length : 0,
    p95LatencyMs: percentile(observations.map((item) => item.latencyMs), 0.95),
    environments: [...new Set(observations.map((item) => item.environment))],
    includesCodeSwitching: observations.some((item) => item.codeSwitched),
    includesImpairedSpeech: observations.some((item) => item.impairedSpeech),
  }
}

/** Pilot gates are product safety thresholds, not universal linguistic claims. */
export function pilotReadiness(summary: VoiceEvaluationSummary) {
  const missingEnvironments = REQUIRED_EVALUATION_ENVIRONMENTS.filter((item) => !summary.environments.includes(item))
  const reasons = [
    ...(summary.clips < 50 ? ['At least 50 validated clips are required.'] : []),
    ...(missingEnvironments.length ? [`Missing environments: ${missingEnvironments.join(', ')}.`] : []),
    ...(!summary.includesCodeSwitching ? ['Code-switched speech has not been tested.'] : []),
    ...(summary.wordErrorRate > 0.25 ? ['Word error rate is above the 25% pilot ceiling.'] : []),
    ...(summary.taskMeaningPreservedRate < 0.95 ? ['Task meaning was preserved in fewer than 95% of clips.'] : []),
    ...(summary.nativeSpeakerApprovalRate < 0.9 ? ['Native-speaker approval is below 90%.'] : []),
    ...(summary.entityRecall !== null && summary.entityRecall < 0.9 ? ['Ghanaian name and entity recall is below 90%.'] : []),
  ]
  return { ready: reasons.length === 0, reasons }
}
