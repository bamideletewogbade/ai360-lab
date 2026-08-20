import { routeIntentDeterministically } from '@/lib/intent-router'

export type ContextAttachment = {
  name: string
  kind: 'image' | 'video' | 'pdf' | 'text'
  data?: string
  text?: string
}

export type ContextMessage = {
  role: 'user' | 'assistant'
  content: string
  attachments?: ContextAttachment[]
}

const MAX_MESSAGES = 20
const MAX_MESSAGE_CHARACTERS = 60_000
const MAX_CONTEXT_CHARACTERS = 120_000

function cleanText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_CHARACTERS)
}

/**
 * Preserve the person's words while bounding noise and cost. The newest turns
 * win, and a client can never inject an extra system message into the provider
 * context. Summarization belongs in a separately evaluated layer, not here.
 */
export function prepareConversationContext(input: Array<{
  role?: unknown
  content?: unknown
  attachments?: ContextAttachment[]
}>): ContextMessage[] {
  const valid = input.flatMap((message) => {
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return []
    const content = cleanText(message.content)
    if (!content && !message.attachments?.length) return []
    return [{
      role: message.role as ContextMessage['role'],
      content,
      ...(message.attachments?.length ? { attachments: message.attachments.slice(0, 4) } : {}),
    }]
  }).slice(-MAX_MESSAGES)

  let remaining = MAX_CONTEXT_CHARACTERS
  const selected: ContextMessage[] = []
  for (let index = valid.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = valid[index]
    const content = message.content.slice(Math.max(0, message.content.length - remaining))
    selected.push({ ...message, content })
    remaining -= content.length
  }
  return selected.reverse()
}

export type ContextPolicy = {
  freshness: 'off' | 'auto' | 'required'
  liveInformation: boolean
  deepResearch: boolean
  hasAttachments: boolean
  hasVideo: boolean
  hasPdf: boolean
  contextCharacters: number
}

const OFFLINE = /\b(do not|don't|dont|no) (browse|search|use the web|look online)\b/i
const REQUIRED_FRESHNESS = /(?:https?:\/\/|\b(?:latest|current|currently|today|tonight|now|recent|this (?:week|month|year)|news|weather|forecast|score|fixture|schedule|deadline|admission|application portal|available|availability|price|cost|exchange rate|interest rate|stock|market|law|policy|regulation|tax|visa|passport|requirement|president|minister|mayor|ceo|government|election|officeholder|release date|version|update|recommend|best|where (?:can|should) i buy|fact[ -]?check|verify)\b)/i
const DEEP_RESEARCH = /\b(?:deep research|research|investigate|market analysis|competitor analysis|compare (?:several|multiple|the market)|report with sources|multiple sources|evidence|citations?)\b/i
const NO_RETRIEVAL_NEEDED = /^(?:hi|hello|hey|yo|thanks|thank you|good (?:morning|afternoon|evening))\b|^(?:rewrite|rephrase|proofread|edit|translate|brainstorm|draft|compose)\b/i

/**
 * Freshness is separate from product routing. A short current fact belongs in
 * everyday chat; a multi-source investigation belongs in Research. The model
 * gets discretion for ordinary factual questions, while mutable claims are
 * never allowed to rely silently on training data.
 */
export function freshnessForPrompt(prompt: string): 'off' | 'auto' | 'required' {
  const text = prompt.replace(/\s+/g, ' ').trim().slice(0, 20_000)
  if (!text || OFFLINE.test(text)) return 'off'
  if (REQUIRED_FRESHNESS.test(text)) return 'required'
  if (NO_RETRIEVAL_NEEDED.test(text)) return 'off'
  return 'auto'
}

export function policyForConversation(messages: ContextMessage[]): ContextPolicy {
  const attachments = messages.flatMap((message) => message.attachments ?? [])
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const freshness = freshnessForPrompt(latestUser)
  const deepResearch = freshness !== 'off' && (
    routeIntentDeterministically(latestUser).reason === 'explicit_research'
    || DEEP_RESEARCH.test(latestUser)
  )
  return {
    freshness,
    liveInformation: freshness !== 'off',
    deepResearch,
    hasAttachments: attachments.length > 0,
    hasVideo: attachments.some((attachment) => attachment.kind === 'video'),
    hasPdf: attachments.some((attachment) => attachment.kind === 'pdf'),
    contextCharacters: messages.reduce((total, message) => total + message.content.length, 0),
  }
}
