/**
 * Parsing and context handling for the agent pipeline.
 *
 * Depends only on the provider-content normalizer, which is itself dependency
 * free, so this stays directly unit testable. Everything here deals with output
 * from a language model, which means malformed JSON, prose wrapped around JSON,
 * and missing fields are all normal inputs rather than exceptional ones. Every
 * function degrades to a safe default instead of throwing, because a planner
 * that returns nonsense should cost the user one task, not the run.
 */

import { providerContentText, stripThinkingBlocks } from '@/lib/provider-content'
import { citationSources } from '@/lib/live-tools'

export const MAX_TASKS = 3

/**
 * How much work the user has asked for.
 *
 * Depth is the one control a person actually cares about: how thorough, and
 * therefore how much it costs and how long it takes. It maps to the number of
 * lines of enquiry and whether the draft is checked before being returned, so
 * the trade-off is real rather than cosmetic.
 */
export type AgentDepth = 'quick' | 'standard' | 'thorough'

export const DEPTHS: Record<AgentDepth, {
  label: string
  maxTasks: number
  verify: boolean
  description: string
}> = {
  quick: { label: 'Quick', maxTasks: 1, verify: false, description: 'One line of enquiry, no checking pass. Fastest and cheapest.' },
  standard: { label: 'Standard', maxTasks: 2, verify: true, description: 'Up to two lines of enquiry, then checked against the sources.' },
  thorough: { label: 'Thorough', maxTasks: MAX_TASKS, verify: true, description: 'Up to three lines of enquiry, then checked and corrected.' },
}

export function isAgentDepth(value: unknown): value is AgentDepth {
  return typeof value === 'string' && value in DEPTHS
}

export type StreamChunk = {
  delta?: string
  /** Raw provider annotations. The caller decides how to read citations. */
  annotations?: unknown
  usage?: { cost?: unknown; total_tokens?: unknown }
  done: boolean
}

/**
 * Interprets one server-sent line from a streaming completion.
 *
 * Kept separate from the network so the parsing rules can be tested directly.
 * A malformed line is ignored rather than thrown, because one bad frame must
 * not lose an answer that is most of the way written.
 */
export function readStreamLine(line: string): StreamChunk | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload) return null
  if (payload === '[DONE]') return { done: true }

  try {
    const json = JSON.parse(payload)
    const choice = json.choices?.[0]
    // Structured content parts were previously dropped entirely rather than
    // read, so a provider that returned them produced a silently empty answer.
    const delta = stripThinkingBlocks(providerContentText(choice?.delta?.content))
    return {
      delta: delta.length ? delta : undefined,
      annotations: choice?.delta?.annotations || choice?.message?.annotations || choice?.annotations,
      usage: json.usage && typeof json.usage === 'object' ? json.usage : undefined,
      done: false,
    }
  } catch {
    return null
  }
}

/**
 * Drains a streaming completion, forwarding text as it arrives.
 *
 * Shared by the agent and the Create coordinator. Both talk to the same
 * endpoint and both need the same three things out of it — the text as it is
 * written, the citations, and the usage that lands in the final frame — so
 * having two copies of this loop only creates the chance for one of them to be
 * fixed and the other not.
 */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  onSource: (source: { url: string; title: string }) => void,
  onUsage: (usage: { cost?: unknown; total_tokens?: unknown } | undefined) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // The last element is whatever arrived mid-line; it stays in the buffer
    // until the rest of it turns up.
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const chunk = readStreamLine(line)
      if (!chunk) continue
      if (chunk.done) return text
      if (chunk.delta) {
        text += chunk.delta
        onDelta(chunk.delta)
      }
      for (const source of citationSources(chunk.annotations)) onSource(source)
      if (chunk.usage) onUsage(chunk.usage)
    }
  }
  return text
}

/** Objectives sent back for approval must be ones we proposed, not new work. */
export function reconcileApprovedPlan(proposed: string[], approved: unknown): string[] {
  if (!Array.isArray(approved)) return []
  const allowed = new Set(proposed.map((objective) => objective.trim()))
  return approved
    .filter((objective): objective is string => typeof objective === 'string')
    .map((objective) => objective.trim())
    .filter((objective) => allowed.has(objective))
    .slice(0, MAX_TASKS)
}

/** Kept as the agent-side name for one shared rule about provider content. */
export function textOf(value: unknown): string {
  return providerContentText(value)
}

export function shorten(value: string, max = 52) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}...` : clean
}

/** Extracts a JSON object even when the model wrapped it in commentary. */
export function parseJsonObject(value: string): unknown {
  if (typeof value !== 'string') return null
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(value.slice(start, end + 1))
  } catch {
    return null
  }
}

export function parsePlan(value: string): string[] {
  const parsed = parseJsonObject(value) as { tasks?: unknown } | null
  if (!parsed || !Array.isArray(parsed.tasks)) return []
  return parsed.tasks
    .map((task) => {
      if (typeof task === 'string') return task.trim()
      if (task && typeof task === 'object' && 'objective' in task) {
        const objective = (task as { objective?: unknown }).objective
        return typeof objective === 'string' ? objective.trim() : ''
      }
      return ''
    })
    .filter((objective) => objective.length > 3)
    .slice(0, MAX_TASKS)
}

export type Verdict = { sound: boolean; issues: string[] }

/**
 * An unreadable verdict is treated as sound, and so is a verdict that fails the
 * draft without saying why.
 *
 * The alternative, defaulting to unsound, would trigger a revision pass on
 * every parse failure: real money spent because a model formatted its reply
 * badly, with no actual defect to fix.
 */
export function parseVerdict(value: string): Verdict {
  const parsed = parseJsonObject(value) as { sound?: unknown; issues?: unknown } | null
  if (!parsed) return { sound: true, issues: [] }
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
      .filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 3)
      .slice(0, 3)
    : []
  const sound = parsed.sound === false ? issues.length === 0 : true
  return { sound, issues }
}

/**
 * Trims findings to fit the synthesis context.
 *
 * The budget is divided between findings rather than spent first-come, so a
 * single long task cannot crowd the others out of the final answer.
 */
export function compactFindings(
  findings: Array<{ objective: string; text: string }>,
  totalBudget = 24_000,
) {
  if (!findings.length) return ''
  const perFinding = Math.max(2_000, Math.floor(totalBudget / findings.length))
  return findings
    .map((finding, index) => `Findings ${index + 1} (${finding.objective}):\n${finding.text.slice(0, perFinding)}`)
    .join('\n\n')
}
