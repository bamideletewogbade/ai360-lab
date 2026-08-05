import { providerPreferences, REASONING_BUDGET, routeFor, type ChatMode } from '@/lib/models'
import { citationSources, RESEARCH_TOOLS } from '@/lib/live-tools'
import { FEATURE_WEIGHTS, usdBudgetForCredits } from '@/lib/billing/credits'
import {
  openRun, recordApprovalRequest, recordArtifact, recordEvent, recordTask,
  saveProgress, saveResult, setRunStatus, setTaskStatus,
} from '@/lib/agent/store'
import {
  compactFindings, DEPTHS, MAX_TASKS, parsePlan, parseVerdict, readStreamLine, shorten, textOf,
  type AgentDepth,
} from '@/lib/agent/protocol'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { providerErrorDetails } from '@/lib/observability'
import { languageDirective, type LanguageCode } from '@/lib/languages'

/**
 * The agent runtime.
 *
 * Previously a single provider call wrapped in fixed progress messages that
 * were emitted whether or not the work behind them happened. This replaces it
 * with a real, bounded pipeline: plan, execute each task, synthesise, verify,
 * and revise only when verification finds something. Every step the user sees
 * corresponds to work that actually ran.
 *
 * Deliberately a workflow rather than an open-ended loop. The shape of research
 * work is known, so fixed stages give predictable cost and latency, and a step
 * that fails is attributable. An unbounded agent buys freedom this task does
 * not need and pays for it in both.
 *
 * Safety is enforced at the schema, not at runtime: planning, synthesis and
 * verification are called with no tools defined at all, so there is no
 * instruction that can talk them into reaching the network.
 */

const PLAN_TOKENS = 600
const EXECUTE_TOKENS = 1_800
const SYNTHESIS_TOKENS = 3_000
const VERIFY_TOKENS = 500
const RUN_DEADLINE_MS = 150_000

/**
 * The most a single run may spend.
 *
 * Derived from the agent's RESERVATION, not its ceiling. Settlement never
 * charges more than what was reserved, so a budget set from the ceiling would
 * let a run spend money the user can never be billed for. If runs routinely
 * stop on budget, raise the reservation deliberately rather than widening this.
 */
export const MAX_RUN_COST_USD = Number(usdBudgetForCredits(FEATURE_WEIGHTS.agent.reserve).toFixed(4))

export type AgentEvent =
  /** Sent first, so a client that loses the stream knows what to ask about. */
  | { type: 'run'; runId: string; recoverable: boolean }
  | { type: 'step'; id: string; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }
  /** `reset` marks the first chunk of a new draft, replacing what came before. */
  | { type: 'delta'; text: string; reset?: boolean }
  | { type: 'plan'; objectives: string[]; depth: AgentDepth; awaitingApproval: boolean; estimatedCredits: number }
  | { type: 'result'; content: string; sources: Source[]; usage: { totalTokens?: number; cost?: number } }
  | { type: 'error'; message: string }

type Source = { url: string; title: string }
type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: unknown }

export type AgentRunInput = {
  goal: string
  messages: ProviderMessage[]
  mode: ChatMode
  depth: AgentDepth
  language: LanguageCode
  /** Routes to the multimodal model only when there is something to look at. */
  hasAttachments?: boolean
  requestId: string
  sessionId?: string
  context: WorkspaceAuthContext | null
  apiKey: string
  siteUrl: string
  siteName: string
  /** Stop after planning and wait for a decision instead of executing. */
  planOnly?: boolean
  /** Objectives the person already approved. Skips planning entirely. */
  approvedObjectives?: string[]
  emit: (event: AgentEvent) => void
  log: { info: (event: string, data?: Record<string, unknown>) => void; warn: (event: string, data?: Record<string, unknown>) => void }
}

export type AgentRunResult = {
  content: string
  sources: Source[]
  costUsd: number
  totalTokens: number
  tasksRun: number
  revised: boolean
  stoppedEarly: 'budget' | 'deadline' | null
  plan: string[]
  awaitingApproval: boolean
}

const SYSTEM_VOICE = `Write in a warm, confident editorial voice. Start with the answer.
Never use em dashes or en dashes. Use periods, commas, colons or parentheses.
Use valid Markdown with short paragraphs, H2 or H3 headings, restrained bold, and lists or tables only when they help.
Never invent a source, URL, statistic or completed action.
Never claim to send, publish, buy, delete or modify anything outside this conversation.
For medical, legal, financial or employment matters, state the limits and recommend qualified review.`

const PLANNER_PROMPT = `You are the planner for AI 360 Agent. Break the user's goal into the smallest set of research tasks that genuinely need separate investigation.

Return ONLY a JSON object of the form {"tasks":[{"objective":"..."}]}.
Use one task when the goal is simple. Use at most ${MAX_TASKS}.
Each objective must be a specific, self-contained question or piece of work, not a generic phase like "research" or "analysis".
Keep each objective under 140 characters so it can be read at a glance.
Never use em dashes or en dashes. Use periods, commas, colons or parentheses.
Do not answer the goal. Only plan it.`

const VERIFIER_PROMPT = `You are the verifier for AI 360 Agent. You are given a user's goal and a draft answer.

Return ONLY a JSON object of the form {"sound": true|false, "issues":["..."]}.
Mark sound as false only for material problems: the goal is not actually answered, a factual claim looks unsupported, a stated source does not back the claim, or a dangerous omission exists.
Ignore matters of style, tone and formatting.
List at most three issues, each a specific, actionable correction.`

function budgetExceeded(spent: number) {
  return spent >= MAX_RUN_COST_USD
}

/** Drains a streaming completion, forwarding text as it arrives. */
async function consumeStream(
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

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const startedAt = Date.now()
  const runId = `run_${input.requestId.slice(0, 48)}`
  const { model: executeModel, models: executeFallbacks } = routeFor(input.mode, {
    workload: 'agent',
    hasAttachments: input.hasAttachments,
  })
  const { model: quickModel } = routeFor('auto', { workload: 'chat' })

  let spent = 0
  let tokens = 0
  let sequence = 0
  let stoppedEarly: AgentRunResult['stoppedEarly'] = null
  const sources = new Map<string, string>()

  const handle = await openRun({
    context: input.context,
    runId,
    goal: input.goal,
    coordinatorModel: executeModel,
    maxCostUsd: MAX_RUN_COST_USD,
    maxDurationMs: RUN_DEADLINE_MS,
  })

  // Mirrors what the client would have on screen. Persisted at every visible
  // boundary so a dropped connection loses the stream, not the run.
  const steps: Array<{ id: string; label: string; status: string }> = []
  let storedPlan: { objectives: string[]; depth: string; awaitingApproval: boolean; estimatedCredits: number } | null = null

  const emit = (event: AgentEvent) => {
    if (event.type === 'step') {
      const existing = steps.findIndex((step) => step.id === event.id)
      const updated = { id: event.id, label: event.label, status: event.status }
      if (existing >= 0) steps[existing] = updated
      else steps.push(updated)
      void saveProgress(handle, { steps, plan: storedPlan })
    } else if (event.type === 'plan') {
      storedPlan = {
        objectives: event.objectives,
        depth: event.depth,
        awaitingApproval: event.awaitingApproval,
        estimatedCredits: event.estimatedCredits,
      }
      void saveProgress(handle, { steps, plan: storedPlan })
    }
    input.emit(event)
  }

  // Announced before any work starts. Without a durable row behind it there is
  // nothing to recover, so the client is told plainly whether recovery is
  // available rather than finding out by failing.
  emit({ type: 'run', runId, recoverable: handle.persisted })

  const event = async (
    type: string, summary: string,
    options: { taskId?: string; visibility?: 'user' | 'operator'; payload?: Record<string, unknown> } = {},
  ) => {
    await recordEvent(handle, { sequence: sequence++, type, summary, ...options })
  }

  const outOfRoom = () => {
    if (budgetExceeded(spent)) { stoppedEarly = 'budget'; return true }
    if (Date.now() - startedAt > RUN_DEADLINE_MS) { stoppedEarly = 'deadline'; return true }
    return false
  }

  /**
   * One provider call. Tools are passed only where the stage genuinely needs them.
   *
   * Passing `onDelta` streams the response instead of waiting for it. Only the
   * stages that produce the answer the person reads are streamed; planning and
   * verification return structured JSON that is meaningless half-written.
   */
  async function call(options: {
    stage: string
    system: string
    messages: ProviderMessage[]
    maxTokens: number
    withTools: boolean
    model: string
    fallbacks?: string[]
    json?: boolean
    onDelta?: (text: string) => void
  }) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(75_000),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': input.siteUrl,
        'X-Title': input.siteName,
      },
      body: JSON.stringify({
        model: options.model,
        ...(options.fallbacks ? { models: options.fallbacks } : {}),
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
        messages: [{ role: 'system', content: options.system }, ...options.messages],
        ...(options.withTools ? { tools: RESEARCH_TOOLS } : {}),
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        ...(options.onDelta ? { stream: true } : {}),
        provider: providerPreferences('agent', { withTools: options.withTools }),
        // Without a cap, a thinking model spends the whole budget reasoning and
        // returns nothing. Models that do not reason ignore this.
        reasoning: REASONING_BUDGET,
        max_tokens: options.maxTokens,
      }),
    })
    if (!response.ok) {
      // The provider's own message is the only thing that explains a 4xx or 5xx.
      // Throwing without it turns every provider fault into "status 500".
      const failure = await providerErrorDetails(response)
      input.log.warn('agent.stage.provider_failed', {
        stage: options.stage, model: options.model, withTools: options.withTools, ...failure,
      })
      throw new Error(`${options.stage} failed with status ${response.status}`)
    }

    const accounted = (usage: { cost?: unknown; total_tokens?: unknown } | undefined) => {
      const cost = Number(usage?.cost)
      if (Number.isFinite(cost)) spent += cost
      const used = Number(usage?.total_tokens)
      if (Number.isFinite(used)) tokens += used
      return Number.isFinite(cost) ? cost : undefined
    }

    if (options.onDelta) {
      if (!response.body) throw new Error(`${options.stage} returned no stream`)
      const text = await consumeStream(response.body, options.onDelta, (source) => sources.set(source.url, source.title), accounted)
      input.log.info('agent.stage.completed', {
        stage: options.stage, model: options.model, streamed: true, spentUsd: Number(spent.toFixed(6)),
      })
      return text
    }

    const json = await response.json()
    const message = json.choices?.[0]?.message
    const cost = accounted(json.usage)
    for (const source of citationSources(message?.annotations)) sources.set(source.url, source.title)

    input.log.info('agent.stage.completed', {
      stage: options.stage, model: options.model,
      costUsd: cost, spentUsd: Number(spent.toFixed(6)),
    })
    return textOf(message?.content)
  }

  const depth = DEPTHS[input.depth]
  // Applied to the stages the person reads: the plan they approve and the
  // answer they receive. Research findings stay in whatever language the
  // sources are in, because translating them early loses accuracy.
  const speaks = languageDirective(input.language)
  const voice = `${SYSTEM_VOICE}\n\n${speaks}`

  // Stage 1: plan. No tools in scope. Skipped entirely when the person has
  // already approved a plan, so approving does not pay for planning twice.
  let objectives: string[] = input.approvedObjectives?.slice(0, depth.maxTasks) ?? []

  if (!objectives.length) {
    emit({ type: 'step', id: 'plan', label: 'Working out what this needs', status: 'active' })
    await event('run.started', `Planning: ${input.goal.slice(0, 200)}`, { payload: { model: quickModel, depth: input.depth } })
    try {
      const planned = await call({
        stage: 'plan',
        system: `${PLANNER_PROMPT}\n\nUse at most ${depth.maxTasks} task(s) for this request.\n\n${speaks}`,
        messages: input.messages,
        maxTokens: PLAN_TOKENS, withTools: false, model: quickModel, json: true,
      })
      objectives = parsePlan(planned)
    } catch (error) {
      input.log.warn('agent.plan.failed', { message: error instanceof Error ? error.message : 'unknown' })
    }
    if (!objectives.length) objectives = [input.goal]
    objectives = objectives.slice(0, Math.min(depth.maxTasks, MAX_TASKS))

    emit({
      type: 'step', id: 'plan',
      label: objectives.length > 1 ? `Planned ${objectives.length} lines of enquiry` : 'Plan ready',
      status: 'complete',
    })
    await event('run.planned', `${objectives.length} task(s) planned`, { payload: { objectives, depth: input.depth } })
  }

  // The whole plan is shown before any of it runs, so the person sees what they
  // are about to pay for rather than discovering it one step at a time.
  emit({
    type: 'plan',
    objectives,
    depth: input.depth,
    awaitingApproval: Boolean(input.planOnly),
    estimatedCredits: FEATURE_WEIGHTS.agent.reserve,
  })

  if (input.planOnly) {
    await setRunStatus(handle, 'awaiting_approval')
    await recordApprovalRequest(handle, {
      id: `apr_${runId}`.slice(0, 64),
      approvalType: 'agent_plan',
      summary: objectives.join(' | ').slice(0, 2_000),
      estimatedCostUsd: MAX_RUN_COST_USD,
      requestedBy: 'agent_runtime',
    })
    await event('run.awaiting_approval', 'Plan is waiting for a decision', { payload: { objectives } })
    return {
      content: '', sources: [], costUsd: spent, totalTokens: tokens,
      tasksRun: 0, revised: false, stoppedEarly: null,
      plan: objectives, awaitingApproval: true,
    }
  }

  // Everything that will run, listed up front.
  if (objectives.length > 1) {
    for (const [index, objective] of objectives.entries()) {
      emit({ type: 'step', id: `task_${index + 1}`, label: shorten(objective), status: 'pending' })
    }
  }
  await setRunStatus(handle, 'running')

  // Stage 2: execute each task. This is the only stage with network tools.
  const findings: Array<{ objective: string; text: string }> = []
  for (const [index, objective] of objectives.entries()) {
    const taskId = `task_${index + 1}`
    await recordTask(handle, { id: taskId, objective, role: 'researcher', sequence: index, model: executeModel })

    if (outOfRoom()) {
      await setTaskStatus(handle, taskId, 'cancelled', { errorCode: stoppedEarly ?? 'stopped' })
      await event('task.skipped', `Skipped: ${objective.slice(0, 160)}`, { taskId, visibility: 'operator' })
      break
    }

    const label = objectives.length > 1 ? `Researching: ${shorten(objective)}` : 'Researching and reading sources'
    emit({ type: 'step', id: taskId, label, status: 'active' })
    await setTaskStatus(handle, taskId, 'running')

    try {
      const text = await call({
        stage: `execute:${taskId}`,
        system: `You are a researcher for AI 360 Agent. Investigate exactly this objective and report what you found, with evidence.\n\nObjective: ${objective}\n\nUse your search and page-reading tools when current information matters. Cite what you used. Report findings only, not a final answer to the wider goal.\n\n${SYSTEM_VOICE}`,
        messages: input.messages,
        maxTokens: EXECUTE_TOKENS, withTools: true,
        model: executeModel, fallbacks: executeFallbacks,
      })
      findings.push({ objective, text })
      emit({ type: 'step', id: taskId, label: objectives.length > 1 ? `Done: ${shorten(objective)}` : 'Research complete', status: 'complete' })
      await setTaskStatus(handle, taskId, 'completed', { outputData: { characters: text.length } })
      await event('task.completed', `Completed: ${objective.slice(0, 160)}`, { taskId })
    } catch (error) {
      emit({ type: 'step', id: taskId, label: `Could not complete: ${shorten(objective)}`, status: 'failed' })
      await setTaskStatus(handle, taskId, 'failed', { errorCode: 'provider_error' })
      await event('task.failed', `Failed: ${objective.slice(0, 160)}`, { taskId, visibility: 'operator' })
      input.log.warn('agent.task.failed', { taskId, message: error instanceof Error ? error.message : 'unknown' })
    }
  }

  if (!findings.length) throw new Error('No agent task produced a result')

  // Stage 3: synthesise. No tools; it may only use what was actually found.
  emit({ type: 'step', id: 'compose', label: 'Putting the answer together', status: 'active' })
  const findingsBlock = compactFindings(findings)
  let firstChunk = true
  let draft = await call({
    stage: 'synthesise',
    system: `You are AI 360 Agent. Produce the final answer to the user's goal using only the research findings supplied. Lead with the result, then the evidence, then practical next steps. Keep the citation links that appear in the findings, near the claims they support.\n\n${voice}`,
    messages: [...input.messages, { role: 'assistant', content: findingsBlock }],
    maxTokens: SYNTHESIS_TOKENS, withTools: false,
    model: executeModel, fallbacks: executeFallbacks,
    onDelta: (text) => {
      emit({ type: 'delta', text, ...(firstChunk ? { reset: true } : {}) })
      firstChunk = false
    },
  })
  emit({ type: 'step', id: 'compose', label: 'Answer drafted', status: 'complete' })

  const artifactId = `art_${runId}`.slice(0, 64)
  await recordArtifact(handle, {
    id: artifactId, title: input.goal.slice(0, 200), artifactType: 'research_answer',
    content: { draftCharacters: draft.length }, verification: 'pending',
  })

  // Stage 4: verify, and stage 5: revise only if it found something real.
  let revised = false
  if (depth.verify && !outOfRoom()) {
    await setRunStatus(handle, 'verifying')
    emit({ type: 'step', id: 'verify', label: 'Checking it against the sources', status: 'active' })
    try {
      const verdictText = await call({
        stage: 'verify', system: VERIFIER_PROMPT,
        messages: [{ role: 'user', content: `Goal:\n${input.goal}\n\nDraft answer:\n${draft.slice(0, 12_000)}` }],
        maxTokens: VERIFY_TOKENS, withTools: false, model: quickModel, json: true,
      })
      const verdict = parseVerdict(verdictText)
      await event('run.verified', verdict.sound ? 'Verification passed' : `Verification raised ${verdict.issues.length} issue(s)`, {
        visibility: 'operator', payload: { sound: verdict.sound, issues: verdict.issues },
      })

      if (!verdict.sound && verdict.issues.length && !outOfRoom()) {
        emit({ type: 'step', id: 'verify', label: `Found ${verdict.issues.length} thing(s) to fix`, status: 'complete' })
        emit({ type: 'step', id: 'revise', label: 'Correcting the draft', status: 'active' })
        // The corrected answer replaces the draft the person has been reading,
        // which is why the first chunk resets rather than appends.
        let firstRevisionChunk = true
        draft = await call({
          stage: 'revise',
          system: `You are AI 360 Agent. Correct the draft to resolve the listed issues. Change only what the issues require. Do not remove citations. Return the corrected answer in full.\n\n${voice}`,
          messages: [{
            role: 'user',
            content: `Goal:\n${input.goal}\n\nDraft:\n${draft}\n\nIssues to resolve:\n${verdict.issues.map((issue) => `- ${issue}`).join('\n')}`,
          }],
          maxTokens: SYNTHESIS_TOKENS, withTools: false, model: executeModel, fallbacks: executeFallbacks,
          onDelta: (text) => {
            emit({ type: 'delta', text, ...(firstRevisionChunk ? { reset: true } : {}) })
            firstRevisionChunk = false
          },
        })
        revised = true
        emit({ type: 'step', id: 'revise', label: 'Corrections applied', status: 'complete' })
      } else {
        emit({ type: 'step', id: 'verify', label: 'Checked against the sources', status: 'complete' })
      }
      await recordArtifact(handle, {
        id: artifactId, title: input.goal.slice(0, 200), artifactType: 'research_answer',
        content: { draftCharacters: draft.length, revised }, verification: verdict.sound ? 'passed' : 'needs_revision',
      })
    } catch (error) {
      // Verification is an improvement, not a gate. Its failure must not lose the draft.
      emit({ type: 'step', id: 'verify', label: 'Answer drafted', status: 'complete' })
      input.log.warn('agent.verify.failed', { message: error instanceof Error ? error.message : 'unknown' })
    }
  }

  const finalSources = [...sources.entries()].map(([url, title]) => ({ url, title })).slice(0, 8)

  // Stored before the status flips to completed, so a client that arrives the
  // instant it finishes never sees "done" with nothing to show.
  await saveResult(handle, {
    content: draft,
    sources: finalSources,
    usage: { totalTokens: tokens, cost: spent },
  })
  await setRunStatus(handle, 'completed', { actualCostUsd: spent })
  await event('run.completed', 'Run completed', {
    visibility: 'operator',
    payload: { costUsd: Number(spent.toFixed(6)), tasks: findings.length, revised, stoppedEarly },
  })

  return {
    content: draft,
    sources: finalSources,
    costUsd: spent,
    totalTokens: tokens,
    tasksRun: findings.length,
    revised,
    stoppedEarly,
    plan: objectives,
    awaitingApproval: false,
  }
}

export async function failRun(requestId: string, context: WorkspaceAuthContext | null, code: string) {
  const handle = await openRun({
    context, runId: `run_${requestId.slice(0, 48)}`, goal: '', coordinatorModel: '',
    maxCostUsd: MAX_RUN_COST_USD, maxDurationMs: RUN_DEADLINE_MS,
  })
  await setRunStatus(handle, 'failed', { errorCode: code })
}

