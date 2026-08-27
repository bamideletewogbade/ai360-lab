export type MessageComplexity = 'simple' | 'demanding'

/**
 * A cheap, synchronous signal for whether an 'auto'-mode chat message looks
 * demanding enough to justify escalating past the fast default model to
 * Claude. Deliberately not a model call: this has to add no latency, so it
 * can run unconditionally on every auto-mode message. Mirrors the style of
 * the deterministic regex router in `intent-router.ts` — small, inspectable
 * signals rather than a scoring model. See AI360_MODEL_ESCALATION_MODE for
 * the shadow/active rollout this feeds; the threshold here is expected to be
 * tuned from shadow-mode observation, not treated as final.
 */
const REASONING_KEYWORDS = /\b(debug|refactor|architecture|audit|prove|step[- ]by[- ]step|optimi[sz]e|analy[sz]e|root cause|why does|why is|walk me through|trade[- ]?offs?|design a|deep dive)\b/i
const CODE_OR_DIFF_BLOCK = /```|^\s{4,}\S|\bdiff --git\b/m
const LONG_MESSAGE_CHARS = 1_200
const DEEP_CONVERSATION_TURNS = 4

export function complexityForMessage(input: { prompt: string; turnCount: number }): MessageComplexity {
  const text = input.prompt.trim()
  if (!text) return 'simple'
  if (REASONING_KEYWORDS.test(text)) return 'demanding'
  if (CODE_OR_DIFF_BLOCK.test(text)) return 'demanding'
  if (text.length >= LONG_MESSAGE_CHARS && input.turnCount >= DEEP_CONVERSATION_TURNS) return 'demanding'
  return 'simple'
}
