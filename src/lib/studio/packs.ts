import { FEATURE_WEIGHTS } from '@/lib/billing/credits'

/**
 * What Create can actually produce.
 *
 * Studio used to be one hardcoded outcome: a full brand and launch pack of
 * exactly eight assets. That is the right thing for a business starting from
 * nothing, and the wrong thing for the far more common case of a business that
 * already exists and needs one specific piece of work.
 *
 * A pack declares the specialists it needs and what each produces. The
 * orchestrator reads this rather than a prompt, so adding an outcome is data,
 * not a rewrite, and the credit cost of every pack is computed from the same
 * weights the rest of the product bills against.
 */

export type SpecialistId =
  | 'researcher'
  | 'analyst'
  | 'planner'
  | 'writer'
  | 'editor'
  | 'teacher'
  | 'brand'
  | 'campaign'
  | 'copy'
  | 'namer'
  | 'domains'
  | 'ads'
  | 'calendar'
  | 'pitch'

export type Specialist = {
  id: SpecialistId
  label: string
  /** Shown while it works. Present tense, plain words. */
  working: string
  /** Whether it reaches the network. Everything else is text work. */
  usesTools: boolean
  /** Roughly what it costs, in the same credits the rest of the product bills. */
  credits: number
}

export const SPECIALISTS: Record<SpecialistId, Specialist> = {
  researcher: { id: 'researcher', label: 'Research', working: 'Finding current, reliable information', usesTools: true, credits: 2 },
  analyst: { id: 'analyst', label: 'Analysis', working: 'Making sense of the evidence and tradeoffs', usesTools: false, credits: 2 },
  planner: { id: 'planner', label: 'Plan', working: 'Turning the goal into practical next steps', usesTools: false, credits: 2 },
  writer: { id: 'writer', label: 'Draft', working: 'Creating the main piece of work', usesTools: false, credits: 3 },
  editor: { id: 'editor', label: 'Review', working: 'Improving clarity, structure and completeness', usesTools: false, credits: 2 },
  teacher: { id: 'teacher', label: 'Learning design', working: 'Making the subject clear and teachable', usesTools: false, credits: 2 },
  brand: { id: 'brand', label: 'Brand', working: 'Shaping the voice, colours and promise', usesTools: false, credits: 2 },
  campaign: { id: 'campaign', label: 'Campaign', working: 'Building the big idea and the plan', usesTools: false, credits: 2 },
  copy: { id: 'copy', label: 'Copywriter', working: 'Writing the pieces you will actually send', usesTools: false, credits: 3 },
  namer: { id: 'namer', label: 'Namer', working: 'Finding names worth owning', usesTools: false, credits: 2 },
  domains: { id: 'domains', label: 'Domains', working: 'Checking which names are actually free', usesTools: true, credits: 1 },
  ads: { id: 'ads', label: 'Ads', working: 'Writing and varying the ads', usesTools: false, credits: 3 },
  calendar: { id: 'calendar', label: 'Calendar', working: 'Laying the posts across the weeks', usesTools: false, credits: 2 },
  pitch: { id: 'pitch', label: 'Pitch', working: 'Sharpening the argument and the answers', usesTools: false, credits: 2 },
}

export type PackId = 'research' | 'plan' | 'write' | 'learn' | 'decide' | 'launch' | 'marketing' | 'ads' | 'naming' | 'pitch' | 'calendar'

export type Pack = {
  id: PackId
  name: string
  /** One line, said the way someone would describe their own problem. */
  outcome: string
  /** Who it is for, so nobody picks the wrong one. */
  bestFor: string
  mark: string
  /** In order. Consecutive entries that can run together are grouped. */
  stages: Array<{ specialists: SpecialistId[] }>
  deliverables: string[]
  /** A pack that needs less than a full business brief says so. */
  needsBrandFile: boolean
}

export const PACKS: Pack[] = [
  {
    id: 'research',
    name: 'Research',
    outcome: 'Build a sourced understanding of a topic or question.',
    bestFor: 'Research, exploration and evidence gathering.',
    mark: '01',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['analyst'] },
    ],
    deliverables: ['Research findings', 'Key evidence and sources', 'Implications and open questions'],
    needsBrandFile: false,
  },
  {
    id: 'plan',
    name: 'Plan',
    outcome: 'Turn an idea or goal into a practical path forward.',
    bestFor: 'Personal, school, community or professional projects.',
    mark: '02',
    stages: [
      { specialists: ['analyst'] },
      { specialists: ['planner'] },
    ],
    deliverables: ['Goal and constraints', 'Recommended approach', 'Milestones and next actions'],
    needsBrandFile: false,
  },
  {
    id: 'write',
    name: 'Write and refine',
    outcome: 'Create a clear, useful document for a specific purpose.',
    bestFor: 'Reports, proposals, guides, articles and other writing.',
    mark: '03',
    stages: [
      { specialists: ['writer'] },
      { specialists: ['editor'] },
    ],
    deliverables: ['Structured draft', 'Edited final version'],
    needsBrandFile: false,
  },
  {
    id: 'learn',
    name: 'Learn or teach',
    outcome: 'Turn a subject into an understandable learning experience.',
    bestFor: 'Study plans, lessons, workshops and course material.',
    mark: '04',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['teacher'] },
      { specialists: ['planner'] },
    ],
    deliverables: ['Learning goals', 'Clear lesson or study material', 'Practice and next steps'],
    needsBrandFile: false,
  },
  {
    id: 'decide',
    name: 'Compare and decide',
    outcome: 'Compare realistic options and reach a well-supported decision.',
    bestFor: 'Choices involving evidence, constraints and tradeoffs.',
    mark: '05',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['analyst'] },
      { specialists: ['planner'] },
    ],
    deliverables: ['Decision criteria', 'Options and tradeoffs', 'Recommendation and next step'],
    needsBrandFile: false,
  },
  {
    id: 'launch',
    name: 'Brand and launch',
    outcome: 'Start something new and put it in front of people.',
    bestFor: 'A business with no brand yet.',
    mark: '06',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['brand'] },
      { specialists: ['campaign'] },
      { specialists: ['copy'] },
    ],
    deliverables: ['Brand direction', 'Campaign plan', 'WhatsApp and SMS copy', 'Social posts', 'Flyer direction', 'Logo direction', 'Video script'],
    needsBrandFile: false,
  },
  {
    id: 'marketing',
    name: 'Marketing pack',
    outcome: 'Run a campaign for the business you already have.',
    bestFor: 'A brand that exists and needs a push.',
    mark: '07',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['campaign'] },
      { specialists: ['copy', 'calendar'] },
    ],
    deliverables: ['Campaign plan', 'Channel copy', 'Four week posting calendar', 'What to measure'],
    needsBrandFile: true,
  },
  {
    id: 'ads',
    name: 'Ads generator',
    outcome: 'Get ads written, in variants worth testing.',
    bestFor: 'Anyone about to spend money on ads.',
    mark: '08',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['ads'] },
    ],
    deliverables: ['Headline and body variants per platform', 'Audience notes', 'What to test first'],
    needsBrandFile: true,
  },
  {
    id: 'naming',
    name: 'Name and domain',
    outcome: 'Find a name you can actually own.',
    bestFor: 'Anyone stuck on what to call it.',
    mark: '09',
    stages: [
      { specialists: ['namer'] },
      { specialists: ['domains'] },
    ],
    deliverables: ['Name candidates with reasoning', 'Real availability for each domain', 'Social handle suggestions'],
    needsBrandFile: false,
  },
  {
    id: 'pitch',
    name: 'Pitch pack',
    outcome: 'Explain the business well enough to be backed or bought from.',
    bestFor: 'Approaching a funder, partner or big customer.',
    mark: '10',
    stages: [
      { specialists: ['researcher'] },
      { specialists: ['pitch'] },
      { specialists: ['copy'] },
    ],
    deliverables: ['One page summary', 'Spoken pitch', 'Answers to the hard questions', 'Follow up email'],
    needsBrandFile: true,
  },
  {
    id: 'calendar',
    name: 'Content calendar',
    outcome: 'Know what to post, every day, for a month.',
    bestFor: 'Anyone who runs out of things to say.',
    mark: '11',
    stages: [
      { specialists: ['calendar'] },
      { specialists: ['copy'] },
    ],
    deliverables: ['Four weeks of posts', 'Captions ready to send', 'Best times to post'],
    needsBrandFile: true,
  },
]

export function findPack(id: string) {
  return PACKS.find((pack) => pack.id === id)
}

export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && PACKS.some((pack) => pack.id === value)
}

/** Every specialist a pack runs, in order, flattened. */
export function packSpecialists(pack: Pack) {
  return pack.stages.flatMap((stage) => stage.specialists)
}

/**
 * What a pack costs, from the same weights the rest of the product bills.
 *
 * Capped at the agent ceiling. A pack is one piece of work to the person paying
 * for it, so it must not quietly cost more than the most expensive thing they
 * have already been shown a price for.
 */
export function packCredits(pack: Pack) {
  const total = packSpecialists(pack).reduce((sum, id) => sum + SPECIALISTS[id].credits, 0)
  return Math.min(total, FEATURE_WEIGHTS.agent.ceiling)
}

/** Stages that can run at the same time, for showing honest parallel progress. */
export function packConcurrency(pack: Pack) {
  return Math.max(...pack.stages.map((stage) => stage.specialists.length))
}
