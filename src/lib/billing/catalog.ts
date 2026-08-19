export type BillingPlan = {
  slug: 'explorer' | 'everyday' | 'builder' | 'team'
  name: string
  eyebrow: string
  audience: string
  monthlyPriceGhs: number
  includedCredits: number
  featured?: boolean
  assisted?: boolean
  workspace: 'personal' | 'organization'
  features: string[]
  templateExamples: string[]
}

export const BILLING_CATALOG_VERSION = 'pilot-2026-08-v3'

export const BILLING_PLANS: BillingPlan[] = [
  {
    slug: 'explorer',
    name: 'Explorer',
    eyebrow: 'Start free',
    audience: 'For trying AI360 and handling occasional everyday tasks.',
    monthlyPriceGhs: 0,
    includedCredits: 5,
    workspace: 'personal',
    features: ['Five work credits reset each month', 'Everyday chat and learning help', 'Local conversation history', 'Basic document and voice input'],
    templateExamples: ['Study helper', 'Quick writing', 'Weekly planner'],
  },
  {
    slug: 'everyday',
    name: 'Everyday',
    eyebrow: 'Made for Ghana',
    audience: 'For students, graduates, parents and professionals using AI each week.',
    monthlyPriceGhs: 125,
    includedCredits: 120,
    featured: true,
    workspace: 'personal',
    features: ['Everything in Explorer', 'Saved work across devices', 'More current research and file analysis', 'Document exports and voice tools', 'Core agent templates'],
    templateExamples: ['Career launch', 'Exam preparation', 'Decision research'],
  },
  {
    slug: 'builder',
    name: 'Builder',
    eyebrow: 'Create and execute',
    audience: 'For people producing campaigns, proposals, research and digital assets.',
    monthlyPriceGhs: 350,
    includedCredits: 400,
    workspace: 'personal',
    features: ['Everything in Everyday', 'Full agent and Studio workflows', 'Image generation allowance', 'Brand guide and project memory', 'Priority production queue'],
    templateExamples: ['Brand launch', 'Campaign builder', 'Proposal studio'],
  },
  {
    slug: 'team',
    name: 'Team',
    eyebrow: 'Shared outcomes',
    audience: 'For businesses, schools, NGOs, programmes and public-service teams.',
    monthlyPriceGhs: 1_200,
    includedCredits: 1_400,
    assisted: true,
    workspace: 'organization',
    features: ['Five members included', 'Shared projects and credit pool', 'Roles, approvals and usage controls', 'Organization agent templates', 'Reporting and priority support'],
    templateExamples: ['NGO proposal', 'Policy brief', 'Community outreach'],
  },
]

/**
 * Top-ups are convenience, not the cheap route.
 *
 * Every top-up must cost more per credit than the entry paid plan, or someone
 * is better off never subscribing. `topup-200` used to give 200 credits, which
 * worked out cheaper per credit than Everyday and quietly inverted that
 * incentive. Bulk still earns a discount relative to smaller top-ups; it just
 * never undercuts a subscription. `tests/pricing-economics.test.ts` enforces it.
 */
export const CREDIT_TOP_UPS = [
  { slug: 'topup-50', priceGhs: 50, credits: 40 },
  { slug: 'topup-100', priceGhs: 100, credits: 90 },
  { slug: 'topup-200', priceGhs: 200, credits: 185 },
] as const

/**
 * Everyday chat is included with a plan, so its cost is bounded by a daily
 * fair-use cap rather than a credit meter. The cap follows the plan, because a
 * free Explorer workspace must not be able to chat like a paid one. Anonymous
 * callers sit at the Explorer allowance.
 *
 * It lives beside the catalogue rather than inside the chat route because the
 * pricing page publishes these exact numbers to customers. Kept in the route,
 * the published figures and the enforced ones could drift apart silently, which
 * is the same failure that let the studio advertise a price the engine did not
 * charge.
 */
export const CHAT_FAIR_USE_DAILY: Record<string, number> = {
  explorer: 10,
  everyday: 60,
  builder: 120,
  team: 150,
}

/** The cap applied when a plan is unknown or the billing database is unreachable. */
export const CHAT_FAIR_USE_FALLBACK = CHAT_FAIR_USE_DAILY.everyday

/**
 * Display-ready strings, so every renderer prints the value directly. The
 * ranges must stay in step with `FEATURE_WEIGHTS`; `tests/credits.test.ts`
 * enforces it.
 */
export const CREDIT_GUIDE = [
  { task: 'Everyday chat on AI-Auto', credits: 'Included with your plan' },
  // Producing a file costs no model time — it is built from work already paid
  // for. That was true before this line existed, and saying nothing about it
  // gave away the most tangible thing the product does without ever crediting
  // it. `FEATURE_WEIGHTS.export` is all zeros, which is what this publishes.
  { task: 'PDF, Word, Excel and PowerPoint files', credits: 'Included, no credits' },
  { task: 'Extra chat beyond your daily limit', credits: '1 credit each' },
  { task: 'Premium model chat (Claude, Kimi)', credits: '1 to 8 credits' },
  { task: 'Current web research or file review', credits: '2 to 4 credits' },
  { task: 'Multi-step agent workflow', credits: '3 to 8 credits' },
  { task: 'Generated image', credits: '3 to 6 credits' },
  { task: 'Four-second promotional video', credits: '6 to 48 credits' },
] as const

export function findBillingPlan(slug: string) {
  return BILLING_PLANS.find((plan) => plan.slug === slug)
}

/**
 * The free monthly allowance, as one number.
 *
 * It was being described six different ways across four pages — "Five free
 * every month", "5 free credits monthly", "Get 5 credits every month", "Five
 * credits a month, free, no card", "the five free credits" — mixing numerals
 * with words for the same fact. One source, one numeral, and it follows the
 * Explorer plan if that ever changes.
 */
export const FREE_MONTHLY_CREDITS = findBillingPlan('explorer')?.includedCredits ?? 5
