import { z } from 'zod'

/**
 * Tools AI360 runs itself.
 *
 * Everything in `live-tools.ts` executes on OpenRouter's side: we name it, the
 * provider runs it, the answer comes back finished. This file is the other kind
 * — a tool whose work happens inside our own system, against our own storage and
 * our own rules. That distinction is the whole point: provider tools can only
 * ever be what somebody else built, while these can reach the parts of AI360
 * that make it ours.
 */

export const CREATE_DOCUMENT_TOOL = {
  type: 'function',
  function: {
    name: 'create_document',
    description: [
      'Produce a downloadable file from content you have written, and attach it to this answer.',
      'Use it when the person asked for something to keep, send or print — a price list, a proposal,',
      'a report, a plan — rather than a conversational answer. Do not use it for ordinary replies,',
      'and never use it just because the answer is long.',
      'Choose xlsx only when the content is genuinely tabular; it renders each markdown table as a sheet.',
      'Choose docx for written documents and pdf when the layout should be fixed for printing or sending.',
      'Choose pptx when the person wants slides, a deck or a presentation; headings become slide titles and each markdown table becomes its own slide.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short, human title for the file, e.g. "Wholesale price list". No file extension.',
        },
        format: {
          type: 'string',
          enum: ['pdf', 'docx', 'xlsx', 'pptx'],
          description: 'pdf for fixed layout, docx for an editable document, xlsx for tabular data, pptx for a slide deck.',
        },
        content: {
          type: 'string',
          description:
            'The full document body in markdown. Use headings, lists and markdown tables. '
            + 'For xlsx, every table becomes a sheet named after the heading above it, so include headings.',
        },
      },
      required: ['title', 'format', 'content'],
      additionalProperties: false,
    },
  },
} as const

/** What the model is allowed to send us, validated before anything is generated. */
export const createDocumentArgumentsSchema = z.object({
  title: z.string().trim().min(1).max(140),
  format: z.enum(['pdf', 'docx', 'xlsx', 'pptx']),
  content: z.string().trim().min(1).max(100_000),
})

export type CreateDocumentArguments = z.infer<typeof createDocumentArgumentsSchema>

/**
 * A tool call assembled from a stream.
 *
 * Providers deliver `tool_calls` in fragments: the id and name arrive early, and
 * the JSON arguments accumulate across many chunks. Nothing can be parsed until
 * the stream says the model has stopped calling tools.
 */
export type StreamedToolCall = {
  index: number
  id: string
  name: string
  argumentsText: string
}

type ToolCallDelta = {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

/**
 * Fold one streamed chunk of `tool_calls` into the calls assembled so far.
 *
 * Kept as a pure function because this is the fiddliest part of the loop and the
 * part most worth testing without a provider in the way.
 */
export function accumulateToolCalls(
  calls: Map<number, StreamedToolCall>,
  deltas: unknown,
): Map<number, StreamedToolCall> {
  if (!Array.isArray(deltas)) return calls
  for (const raw of deltas as ToolCallDelta[]) {
    if (!raw || typeof raw !== 'object') continue
    const index = typeof raw.index === 'number' ? raw.index : 0
    const existing = calls.get(index) ?? { index, id: '', name: '', argumentsText: '' }
    calls.set(index, {
      index,
      id: raw.id || existing.id,
      name: raw.function?.name || existing.name,
      argumentsText: existing.argumentsText + (raw.function?.arguments ?? ''),
    })
  }
  return calls
}

export type ParsedToolCall =
  | { ok: true; id: string; name: string; arguments: CreateDocumentArguments }
  | { ok: false; id: string; name: string; reason: string }

/** Validate an assembled call. A malformed one is reported back to the model, not thrown. */
export function parseToolCall(call: StreamedToolCall): ParsedToolCall {
  if (call.name !== CREATE_DOCUMENT_TOOL.function.name) {
    return { ok: false, id: call.id, name: call.name, reason: `Unknown tool "${call.name}".` }
  }
  let raw: unknown
  try {
    raw = JSON.parse(call.argumentsText || '{}')
  } catch {
    return { ok: false, id: call.id, name: call.name, reason: 'The tool arguments were not valid JSON.' }
  }
  const parsed = createDocumentArgumentsSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false, id: call.id, name: call.name,
      reason: `Invalid ${issue?.path.join('.') || 'arguments'}: ${issue?.message || 'does not match the expected shape'}.`,
    }
  }
  return { ok: true, id: call.id, name: call.name, arguments: parsed.data }
}

/**
 * Whether producing a file is worth offering for this conversation at all.
 *
 * The tool is not attached to every request. A model that can see a tool will
 * eventually reach for it, and a spreadsheet nobody asked for is worse than no
 * spreadsheet — so it is offered only where the person's own words point at
 * something they intend to keep, send or print.
 */
const DELIVERABLE_INTENT =
  /\b(document|doc|pdf|word|excel|powerpoint|ppt|pptx|slides?|spreadsheet|sheet|report|proposal|price\s?list|pricelist|invoice|quote|quotation|letter|contract|brief|plan|deck|presentation|summary|export|download|template|form|checklist|agenda|minutes|catalogue|catalog)\b/i
const PRODUCE_VERB =
  /\b(create|make|draft|write|prepare|produce|generate|build|put together|send me|give me|i need|can you)\b/i

export function shouldOfferDocumentTool(messages: Array<{ role: string; content: string }>) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUser?.content) return false
  const text = lastUser.content.slice(0, 4_000)
  return DELIVERABLE_INTENT.test(text) && PRODUCE_VERB.test(text)
}

/**
 * Guests can ask for a file, but a private download needs an owner. Keep this
 * response deterministic instead of leaving a model without the document tool
 * to improvise an inaccurate "I can't create files" answer.
 */
export const GUEST_DOCUMENT_SIGN_IN_MESSAGE =
  'To create and securely save a downloadable PDF, Word document, Excel workbook, or PowerPoint presentation, '
  + '[sign in to AI360](/sign-in?next=%2Fapp), then send this request again. '
  + 'Signing in keeps the file private and available across your devices.'

export function guestDocumentSignInMessage(input: {
  authConfigured: boolean
  authenticated: boolean
  messages: Array<{ role: string; content: string }>
}) {
  if (!input.authConfigured || input.authenticated || !shouldOfferDocumentTool(input.messages)) return null
  return GUEST_DOCUMENT_SIGN_IN_MESSAGE
}
