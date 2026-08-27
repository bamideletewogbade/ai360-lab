import { providerPreferences, REASONING_BUDGET, routeFor } from '@/lib/models'
import { citationSources, RESEARCH_TOOLS } from '@/lib/live-tools'
import { consumeStream } from '@/lib/agent/protocol'
import { languageDirective, type LanguageCode } from '@/lib/languages'
import { providerErrorDetails } from '@/lib/observability'
import { checkDomains, type DomainResult } from '@/lib/studio/domains'
import { packCredits, packSpecialists, SPECIALISTS, type Pack, type SpecialistId } from '@/lib/studio/packs'
import { FEATURE_WEIGHTS, usdBudgetForCredits } from '@/lib/billing/credits'
import { evaluatePackSections, type SectionEvaluation } from '@/lib/studio/evaluator'

/**
 * The Create coordinator.
 *
 * A pack declares which specialists it needs and in what order. This runs them:
 * stages in sequence, specialists inside a stage at the same time, each seeing
 * what the earlier stages produced.
 *
 * The parallelism is real, not decorative. When the marketing pack shows the
 * copywriter and the calendar working together, they genuinely are, which is
 * why the progress view is worth watching rather than being an animation
 * playing over a single long request.
 *
 * Only the researcher and the domain checker reach outside. Everything else is
 * called with no tools defined at all, the same rule the agent uses: capability
 * comes from the schema, not from asking.
 */

export type Intake = {
  businessName?: string
  industry?: string
  offer?: string
  audience?: string
  goal?: string
  location?: string
  channels?: string[]
  notes?: string
}

export type PackEvent =
  | { type: 'pack'; packId: string; specialists: Array<{ id: SpecialistId; label: string; working: string }>; estimatedCredits: number }
  | { type: 'specialist'; id: SpecialistId; status: 'pending' | 'active' | 'complete' | 'failed'; detail?: string }
  /**
   * Text as the specialist writes it, before the section is finished.
   *
   * A pack is several model calls in sequence, so the total wait is the sum of
   * all of them — a three-stage pack has measured at over a minute and a half.
   * That total does not change by streaming, but what the person stares at
   * does: without this they watch a spinner for the whole of the first stage
   * before a single word appears.
   */
  | { type: 'delta'; id: SpecialistId; text: string }
  | { type: 'section'; id: SpecialistId; title: string; content: string }
  | { type: 'domains'; results: DomainResult[] }
  | { type: 'review'; status: 'checking' | 'correcting' | 'complete'; evaluations: SectionEvaluation[]; detail: string }
  | { type: 'result'; sections: PackSection[]; sources: Array<{ url: string; title: string }>; usage: { cost: number; totalTokens: number } }
  | { type: 'error'; message: string }

export type PackSection = { id: SpecialistId; title: string; content: string }

export type PackRunInput = {
  pack: Pack
  intake: Intake
  language: LanguageCode
  /** The project's knowledge base, if any, so every specialist works from the
   *  same uploaded brand notes, price lists and briefs rather than guessing. */
  knowledge?: string
  apiKey: string
  siteUrl: string
  siteName: string
  emit: (event: PackEvent) => void
  log: {
    info: (event: string, data?: Record<string, unknown>) => void
    warn: (event: string, data?: Record<string, unknown>) => void
  }
}

export type PackRunResult = {
  sections: PackSection[]
  sources: Array<{ url: string; title: string }>
  costUsd: number
  totalTokens: number
  stoppedEarly: boolean
}

const STAGE_TOKENS = 2_200
const RUN_DEADLINE_MS = 180_000

/** A pack may never spend more than the credits it reserved are worth. */
export function packBudgetUsd(pack: Pack) {
  return Number(usdBudgetForCredits(packCredits(pack)).toFixed(4))
}

const HOUSE_STYLE = `Write for the person doing the project, not for an internal department.
Be specific. Never invent a fact about the person, organisation or subject; mark proposals as recommendations.
Never use em dashes or en dashes. Use periods, commas, colons or parentheses.
Use Markdown with a short summary first, H3 headings, short paragraphs, lists and tables where they improve scanning. Never use an H1 or H2.
Respect the location and context in the brief. Do not assume the project is commercial, professional, or based in any particular country.
Never claim a file was produced. Describe a design or write a script instead.`

const SPECIALIST_BRIEFS: Record<SpecialistId, string> = {
  researcher: `You are the researcher. Find what is actually true right now about the project's topic and question.
Search the live web. Cite what you used with descriptive Markdown links next to the claim it supports.
Report findings only, not recommendations. If you could not verify something, say so plainly.`,

  analyst: `You are the analyst. Turn the available facts into a useful understanding.
Produce: the central question, the strongest findings, patterns and tensions, important constraints, and what the evidence means for the goal.
Separate evidence from inference. Call out uncertainty and missing information plainly.`,

  planner: `You are the planner. Turn the goal and prior work into a realistic path forward.
Produce: the recommended approach, clear milestones, the next five actions in order, likely risks with responses, and a simple way to know whether the work is succeeding.
Use dates or durations only when the brief supports them.`,

  writer: `You are the writer. Create the main document the person asked for.
Match the purpose, audience and requested format. Open with a concise summary, use descriptive sections, and make the result useful without extra explanation.
If an essential detail is missing, state the assumption once instead of filling the document with placeholders.`,

  editor: `You are the editor. Turn the prior draft into the strongest usable version.
Preserve accurate facts and the intended meaning. Improve structure, clarity, tone and completeness. Remove repetition and vague filler.
Return the full refined document, not editing notes.`,

  teacher: `You are the learning designer. Make the subject understandable and usable for the intended learners.
Produce: learning goals, a clear explanation in logical parts, examples or activities, checks for understanding, and practical next steps.
Use language and difficulty appropriate to the audience in the brief.`,

  brand: `You are the brand strategist. Give this business a voice it can hold consistently.
Produce: what it stands for in one sentence, who it is for, three personality traits, tone of voice with a do and a do not, three colours with hex codes and what each is for, and one tagline under eight words.`,

  campaign: `You are the campaign planner. Turn the goal into one campaign someone can actually run.
Produce: the big idea in one sentence, the single message, which channels and why those, a four week shape, one clear call to action, and what to count as success.`,

  copy: `You are the copywriter. Write the pieces they will actually send, ready to paste.
Produce: one WhatsApp broadcast under 90 words, one SMS under 160 characters, two social captions, one short email, and one flyer headline with three supporting lines.
No placeholders. If a detail is missing, write the most reasonable version and mark it as a suggestion.`,

  namer: `You are the namer. Propose names this business could own.
Produce eight candidates. For each: the name, what it suggests, how it sounds said aloud in Ghana, and one risk.
Prefer names that are easy to say on the phone and hard to misspell. Avoid names that only work in English if the audience is mixed.
End with a line listing the domains to check, as a plain comma separated list of name.com and name.com.gh forms, lowercase, no other text on that line, prefixed with DOMAINS:`,

  domains: '',

  ads: `You are the ads specialist. Write ads worth spending money on.
Produce, for each of Facebook and Instagram, TikTok, and Google search: three headline variants, two body variants, and one call to action.
Then: who to target and why, and the single thing to test first.
Keep every variant genuinely different in angle, not reworded.`,

  calendar: `You are the content planner. Fill four weeks so they never wonder what to post.
Produce a week by week plan. For each week: the theme, then three posts with the day, the channel, the hook and what the post is for.
Vary the kind of post: proof, teaching, offer, behind the scenes, customer voice.`,

  pitch: `You are the pitch coach. Make the case for this business to someone who can fund it or buy from it.
Produce: a one page summary with the problem, what they do, why now, and what they want; a spoken pitch of about 60 seconds; the five hardest questions with honest answers; and one follow up email.`,

  /**
   * Skills discovery, built on three documented methods rather than invented
   * personality categories:
   *
   *   - Motivational Interviewing (Miller & Rollnick): open questions,
   *     affirmations, reflective listening, summarising. Its central finding is
   *     that people talk themselves into change; being told what they are good
   *     at does not stick, recognising it themselves does.
   *   - The Good Time Journal (Burnett & Evans, Designing Your Life, Stanford):
   *     locate skill by tracking engagement and energy in real past activity,
   *     not by asking someone to rate abstract traits.
   *   - Transferable-skills inventory (Bolles, What Color Is Your Parachute?):
   *     separate the skill from the setting it happened in, which is what lets
   *     unpaid and informal work count as evidence.
   *
   * The Ghana framing is not decoration. All three methods were written for
   * labour markets with formal jobs, written CVs and career ladders. Here the
   * strongest evidence is often unpaid, informal or family work, and the
   * realistic next step is usually earning alongside a job or studies rather
   * than instead of one. A version that ignores that returns advice nobody can
   * act on.
   */
  interviewer: `You are the discovery interviewer. Find what this person can already do, from evidence they give you — never from flattery or guesswork.

Work from what is in the brief. Do not ask for more; draw everything you can out of what is there.

Method:
- Look for concrete past episodes, not self-descriptions. "I organised my church's harvest" is evidence. "I am a good leader" is not.
- For each episode, separate the skill from the setting. Someone who ran a susu group for two years has done bookkeeping, collections, trust-holding and dispute resolution, whether or not anyone called it that.
- Weight engagement and energy, not just competence. Something they did well but hated is not a direction.
- Count unpaid, informal, family and apprenticeship work as real evidence. For most people here it is the strongest evidence they have.
- Reflect back what you heard before concluding, so they can correct you.

Produce:
1. Five to eight skills you can actually evidence, each with the specific episode it comes from.
2. Which of those they seemed most alive doing, and what makes you say so.
3. What the evidence does not show — gaps and open questions, stated plainly.
4. Two or three honest questions they should sit with.

Never invent an episode, a qualification or an achievement. If the brief is thin, say what is missing rather than filling it in. Do not flatter; an inflated reading of someone's skills costs them money later.`,
}

export async function runPack(input: PackRunInput): Promise<PackRunResult> {
  const startedAt = Date.now()
  const budget = packBudgetUsd(input.pack)
  const { model, models } = routeFor('auto', { workload: 'studio' })
  const speaks = languageDirective(input.language)

  let spent = 0
  let tokens = 0
  let stoppedEarly = false
  const sources = new Map<string, string>()
  const sections: PackSection[] = []

  const roster = packSpecialists(input.pack).map((id) => ({
    id,
    label: SPECIALISTS[id].label,
    working: SPECIALISTS[id].working,
  }))
  input.emit({
    type: 'pack',
    packId: input.pack.id,
    specialists: roster,
    estimatedCredits: packCredits(input.pack),
  })
  for (const specialist of roster) {
    input.emit({ type: 'specialist', id: specialist.id, status: 'pending' })
  }

  const outOfRoom = () => {
    if (spent >= budget) { stoppedEarly = true; return true }
    if (Date.now() - startedAt > RUN_DEADLINE_MS) { stoppedEarly = true; return true }
    return false
  }

  const knowledge = (input.knowledge ?? '').trim()
  const brief = [
    `Project or subject: ${input.intake.businessName || 'not given'}`,
    `Topic or area: ${input.intake.industry || 'not given'}`,
    `Requested outcome: ${input.intake.offer || 'not given'}`,
    `Intended audience or user: ${input.intake.audience || 'not given'}`,
    `Goal: ${input.intake.goal || 'not given'}`,
    `Relevant place or context: ${input.intake.location || 'not given'}`,
    `Requested formats or destinations: ${(input.intake.channels ?? []).join(', ') || 'not given'}`,
    `Notes: ${input.intake.notes || 'none'}`,
    // The project's own materials are ground truth. They override any assumption
    // a specialist might otherwise make about the business.
    knowledge ? `\nProject knowledge base (treat as authoritative project context):\n${knowledge}` : '',
  ].filter(Boolean).join('\n')

  /**
   * One specialist. Tools only where the brief genuinely needs the network.
   *
   * Streamed, so the section fills in as it is written rather than appearing
   * whole after the stage finishes. The specialists that use tools stream too:
   * `RESEARCH_TOOLS` are OpenRouter's own server-side tools, so the search runs
   * on their side and the model's text arrives on the same stream, citations
   * included. There is a pause before the first token while that search runs,
   * which is why the caller keeps showing the "working" line until text starts.
   *
   * Passing no `onDelta` falls back to a single buffered response. The
   * correction pass uses that: it rewrites a section that is already on screen,
   * and streaming a replacement over the top would show the reader their
   * finished work being unwritten and rewritten.
   */
  async function callSpecialist(
    id: SpecialistId,
    priorWork: string,
    correctionIssues: string[] = [],
    onDelta?: (text: string) => void,
  ) {
    const specialist = SPECIALISTS[id]
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': input.siteUrl,
        'X-Title': input.siteName,
      },
      body: JSON.stringify({
        model,
        models,
        messages: [
          { role: 'system', content: `${SPECIALIST_BRIEFS[id]}\n\n${HOUSE_STYLE}\n\n${speaks}` },
          {
            role: 'user',
            content: `${brief}${priorWork ? `\n\nWhat the team has produced so far:\n${priorWork}` : ''}${correctionIssues.length ? `\n\nQuality review found these problems in your section:\n- ${correctionIssues.join('\n- ')}\nRewrite your section once and fix only those problems.` : ''}`,
          },
        ],
        ...(specialist.usesTools ? { tools: RESEARCH_TOOLS } : {}),
        ...(onDelta ? { stream: true } : {}),
        provider: providerPreferences('studio', { withTools: specialist.usesTools }),
        reasoning: REASONING_BUDGET,
        max_tokens: STAGE_TOKENS,
      }),
    })

    if (!response.ok) {
      const failure = await providerErrorDetails(response)
      input.log.warn('studio.specialist.failed', { specialist: id, ...failure })
      throw new Error(`${id} failed with status ${response.status}`)
    }

    // Usage arrives in the stream's final frame rather than a response body, so
    // the budget is credited through the same callback either way. Getting this
    // wrong would uncap the pack: `outOfRoom` reads `spent`.
    const accounted = (usage: { cost?: unknown; total_tokens?: unknown } | undefined) => {
      const cost = Number(usage?.cost)
      if (Number.isFinite(cost)) spent += cost
      const used = Number(usage?.total_tokens)
      if (Number.isFinite(used)) tokens += used
    }

    if (onDelta) {
      if (!response.body) throw new Error(`${id} returned no stream`)
      const content = await consumeStream(
        response.body,
        onDelta,
        (source) => sources.set(source.url, source.title),
        accounted,
      )
      input.log.info('studio.specialist.completed', { specialist: id, streamed: true, characters: content.length })
      return content
    }

    const json = await response.json()
    const message = json.choices?.[0]?.message
    accounted(json.usage)
    for (const source of citationSources(message?.annotations)) sources.set(source.url, source.title)

    const content = typeof message?.content === 'string' ? message.content : ''
    input.log.info('studio.specialist.completed', { specialist: id, streamed: false, characters: content.length })
    return content
  }

  /** The domain checker is not a model. It asks registries and reports what they say. */
  async function runDomainCheck(priorWork: string) {
    const line = priorWork.split('\n').reverse().find((row) => row.trim().toUpperCase().startsWith('DOMAINS:'))
    const candidates = (line ?? '')
      .replace(/^\s*DOMAINS:/i, '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 16)

    if (!candidates.length) {
      return { content: 'No domain candidates were proposed, so nothing could be checked.', results: [] }
    }

    const results = await checkDomains(candidates)
    const free = results.filter((result) => result.verdict === 'available')
    const unknown = results.filter((result) => result.verdict === 'unknown')

    const lines = [
      `### Domain availability`,
      '',
      ...results.map((result) => {
        const label = result.verdict === 'available' ? 'free' : result.verdict === 'taken' ? 'taken' : 'cannot confirm'
        return `- **${result.domain}**: ${label}. ${result.reason}`
      }),
      '',
      free.length
        ? `${free.length} of these are free to register right now.`
        : 'None of these are confirmed free.',
      unknown.length
        ? `${unknown.length} could not be confirmed, because their registry publishes no public lookup. Check those with a registrar before you rely on them.`
        : '',
    ].filter(Boolean)

    return { content: lines.join('\n'), results }
  }

  for (const stage of input.pack.stages) {
    if (outOfRoom()) {
      for (const id of stage.specialists) {
        input.emit({ type: 'specialist', id, status: 'failed', detail: 'Stopped to stay inside the credits reserved.' })
      }
      break
    }

    const priorWork = sections.map((section) => `## ${section.title}\n${section.content}`).join('\n\n')
    for (const id of stage.specialists) input.emit({ type: 'specialist', id, status: 'active' })

    // Specialists inside a stage genuinely run together.
    const outcomes = await Promise.all(stage.specialists.map(async (id) => {
      try {
        if (id === 'domains') {
          const { content, results } = await runDomainCheck(priorWork)
          input.emit({ type: 'domains', results })
          return { id, content, ok: true as const }
        }
        // Specialists in the same stage stream at the same time, so every delta
        // carries its own id and the client keeps them in separate sections
        // rather than interleaving two authors into one block of text.
        const content = await callSpecialist(id, priorWork, [], (text) => {
          input.emit({ type: 'delta', id, text })
        })
        return { id, content, ok: true as const }
      } catch (error) {
        input.log.warn('studio.specialist.error', {
          specialist: id,
          message: error instanceof Error ? error.message : 'unknown',
        })
        return { id, content: '', ok: false as const }
      }
    }))

    for (const outcome of outcomes) {
      if (!outcome.ok || !outcome.content) {
        input.emit({ type: 'specialist', id: outcome.id, status: 'failed', detail: 'This part could not be produced.' })
        continue
      }
      const section = { id: outcome.id, title: SPECIALISTS[outcome.id].label, content: outcome.content }
      sections.push(section)
      input.emit({ type: 'specialist', id: outcome.id, status: 'complete' })
      input.emit({ type: 'section', ...section })
    }
  }

  if (!sections.length) throw new Error('No specialist produced anything')

  let evaluations = evaluatePackSections(sections)
  input.emit({
    type: 'review',
    status: 'checking',
    evaluations,
    detail: 'Checking every deliverable for completeness, placeholders and source quality.',
  })

  // One bounded correction pass. It never extends the run deadline or spends
  // beyond the amount already reserved for the pack.
  const needsCorrection = evaluations.filter((evaluation) => !evaluation.passed && evaluation.id !== 'domains').slice(0, 2)
  for (const evaluation of needsCorrection) {
    if (outOfRoom()) break
    input.emit({ type: 'review', status: 'correcting', evaluations, detail: `Improving ${SPECIALISTS[evaluation.id].label}.` })
    input.emit({ type: 'specialist', id: evaluation.id, status: 'active', detail: 'Correcting the quality review findings.' })
    const priorWork = sections
      .filter((section) => section.id !== evaluation.id)
      .map((section) => `## ${section.title}\n${section.content}`)
      .join('\n\n')
    try {
      const content = await callSpecialist(evaluation.id, priorWork, evaluation.issues)
      const index = sections.findIndex((section) => section.id === evaluation.id)
      if (index >= 0 && content) {
        sections[index] = { ...sections[index], content }
        input.emit({ type: 'section', ...sections[index] })
      }
      input.emit({ type: 'specialist', id: evaluation.id, status: 'complete', detail: 'Quality review passed to the final check.' })
    } catch {
      input.emit({ type: 'specialist', id: evaluation.id, status: 'failed', detail: 'The correction pass could not be completed.' })
    }
    evaluations = evaluatePackSections(sections)
  }

  input.emit({
    type: 'review',
    status: 'complete',
    evaluations,
    detail: evaluations.every((evaluation) => evaluation.passed)
      ? 'Every deliverable passed the quality gate.'
      : 'The project is usable, with remaining quality notes shown for review.',
  })

  return {
    sections,
    sources: [...sources.entries()].map(([url, title]) => ({ url, title })).slice(0, 12),
    costUsd: spent,
    totalTokens: tokens,
    stoppedEarly,
  }
}

export { FEATURE_WEIGHTS }
