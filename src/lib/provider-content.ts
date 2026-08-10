/**
 * Normalization for whatever a provider actually puts in `delta.content`.
 *
 * The chat route used to annotate that field as `string | undefined` and pass
 * it to the browser untouched. The annotation was a hope, not a check. Models
 * behind OpenRouter return three different shapes for the same field, and one
 * of them reached a real user as a wall of raw JSON instead of an answer:
 *
 *   "text"                                    a plain string
 *   [{ "type": "text", "text": "..." }]       structured content parts
 *   { "type": "text", "text": "..." }         a single bare part
 *
 * The agent runtime already handled the array case in `textOf`. The chat route
 * did not, because it is a separate hand-written copy of the same provider
 * call. This module is the one place that decides what provider content means,
 * so fixing it once fixes it everywhere.
 */

type ContentPart = { type?: unknown; text?: unknown }

function partText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const part = value as ContentPart
  // Reasoning parts are deliberately dropped. They are the model's private
  // working, and a person asking a question did not ask to read it.
  if (part.type === 'thinking' || part.type === 'reasoning') return ''
  return typeof part.text === 'string' ? part.text : ''
}

/**
 * Some models return their answer as a string that is itself a JSON content
 * envelope, `{"type":"text","text":"..."}`, rather than as a real content part.
 * Verified on 2026-08-10: Qwen served through OpenRouter did this, and the raw
 * envelope reached a user as their answer. Recovered only when the whole string
 * is exactly that envelope, so ordinary prose that merely contains a brace is
 * never touched.
 */
function recoverEnvelope(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text
  if (!trimmed.includes('"text"')) return text
  try {
    const parsed = JSON.parse(trimmed)
    const recovered = Array.isArray(parsed)
      ? parsed.map(partText).join('')
      : partText(parsed)
    return recovered || text
  } catch {
    return text
  }
}

/** Flattens any provider content shape into the text a person should read. */
export function providerContentText(value: unknown): string {
  if (typeof value === 'string') return recoverEnvelope(value)
  if (Array.isArray(value)) return value.map(partText).join('')
  return partText(value)
}

/**
 * Some models emit their private reasoning as ordinary content wrapped in
 * `<think>` tags rather than in the separate `reasoning` field. Verified on
 * 2026-08-10: a chat request finished on `length` after spending all 2000
 * output tokens narrating its plan, so the person received the working and
 * never received the answer.
 *
 * Only a complete, well-formed block is removed. A partial opening tag is left
 * alone, because during streaming it may simply not have closed yet and
 * guessing would delete real content.
 */
export function stripThinkingBlocks(text: string): string {
  if (!text.includes('<think')) return text
  return text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '').trimStart()
}

/**
 * Recognizes an answer that is really the model's planning notes.
 *
 * Used to warn rather than to delete. Silently discarding a long response
 * because it matched a heuristic would turn a visible fault into an invisible
 * one, which is worse.
 */
const REASONING_OPENERS = [
  /^\s*thinking\s+process\s*:/i,
  /^\s*thought\s+process\s*:/i,
  /^\s*<think\b/i,
  /^\s*okay,\s+(?:so\s+)?the\s+user\b/i,
  /^\s*let\s+me\s+think\s+(?:about|through)\b/i,
  /^\s*first,?\s+i\s+(?:need|should|will)\s+to?\b/i,
]

export function looksLikeLeakedReasoning(text: string): boolean {
  return REASONING_OPENERS.some((pattern) => pattern.test(text))
}

/**
 * Whether the visible answer was cut off before it was finished.
 *
 * `length` means the token budget ran out mid-sentence. The person should be
 * told, not left to wonder why the reply stops in the middle of a word.
 */
export function wasTruncated(finishReason: unknown): boolean {
  return finishReason === 'length' || finishReason === 'max_tokens'
}

/**
 * The model that actually served a request.
 *
 * OpenRouter is asked for one model plus an ordered fallback list, and with
 * price-sorted routing it frequently serves a different one. Recording the
 * requested model instead of the served model was attributing every cost to
 * the wrong place. Verified on 2026-08-10: a request for `openai/gpt-5.6-luna`
 * carrying the standard fallback array was served by Alibaba's Qwen, and the
 * usage ledger still recorded it as the OpenAI model.
 */
export function servedModel(chunk: { model?: unknown }, requested: string): string {
  return typeof chunk?.model === 'string' && chunk.model.trim() ? chunk.model : requested
}
