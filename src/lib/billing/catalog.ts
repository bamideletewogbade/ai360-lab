export type BillingCadence = 'monthly' | 'annual'

export type BillingPlan = {
  slug: 'explorer' | 'everyday' | 'builder' | 'team'
  name: string
  eyebrow: string
  audience: string
  monthlyPriceGhs: number
  annualMonthlyPriceGhs: number
  includedCredits: number
  featured?: boolean
  workspace: 'personal' | 'organization'
  features: string[]
  templateExamples: string[]
}

export const BILLING_CATALOG_VERSION = 'pilot-2026-08-v1'

export const BILLING_PLANS: BillingPlan[] = [
  {
    slug: 'explorer',
    name: 'Explorer',
    eyebrow: 'Start free',
    audience: 'For trying AI 360 and handling occasional everyday tasks.',
    monthlyPriceGhs: 0,
    annualMonthlyPriceGhs: 0,
    includedCredits: 120,
    workspace: 'personal',
    features: ['Everyday chat and learning help', 'Limited current web research', 'Local conversation history', 'Basic document and voice input'],
    templateExamples: ['Study helper', 'Quick writing', 'Weekly planner'],
  },
  {
    slug: 'everyday',
    name: 'Everyday',
    eyebrow: 'Made for Ghana',
    audience: 'For students, graduates, parents and professionals using AI each week.',
    monthlyPriceGhs: 39,
    annualMonthlyPriceGhs: 33,
    includedCredits: 900,
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
    monthlyPriceGhs: 89,
    annualMonthlyPriceGhs: 75,
    includedCredits: 2_600,
    workspace: 'personal',
    features: ['Everything in Everyday', 'Full agent and Studio workflows', 'Image generation allowance', 'Brand guide and project memory', 'Priority production queue'],
    templateExamples: ['Brand launch', 'Campaign builder', 'Proposal studio'],
  },
  {
    slug: 'team',
    name: 'Team',
    eyebrow: 'Shared outcomes',
    audience: 'For businesses, schools, NGOs, programmes and public-service teams.',
    monthlyPriceGhs: 299,
    annualMonthlyPriceGhs: 249,
    includedCredits: 8_000,
    workspace: 'organization',
    features: ['Five members included', 'Shared projects and credit pool', 'Roles, approvals and usage controls', 'Organization agent templates', 'Reporting and priority support'],
    templateExamples: ['NGO proposal', 'Policy brief', 'Community outreach'],
  },
]

export const CREDIT_TOP_UPS = [
  { slug: 'topup-10', priceGhs: 10, credits: 200 },
  { slug: 'topup-25', priceGhs: 25, credits: 550 },
  { slug: 'topup-50', priceGhs: 50, credits: 1_200 },
] as const

export function findBillingPlan(slug: string) {
  return BILLING_PLANS.find((plan) => plan.slug === slug)
}

export function planPrice(plan: BillingPlan, cadence: BillingCadence) {
  return cadence === 'annual' ? plan.annualMonthlyPriceGhs : plan.monthlyPriceGhs
}
