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

export const CREDIT_GUIDE = [
  { task: 'Quick answer or writing help', credits: '1' },
  { task: 'Current web research or file review', credits: '2' },
  { task: 'Multi-step agent workflow', credits: '3 to 8' },
  { task: 'Generated image', credits: '3 to 6' },
  { task: 'Four-second promotional video', credits: '12 to 20' },
] as const

export function findBillingPlan(slug: string) {
  return BILLING_PLANS.find((plan) => plan.slug === slug)
}
