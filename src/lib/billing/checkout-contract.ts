import { z } from 'zod'
import { BILLING_PLANS } from '@/lib/billing/catalog'

const paidPlanSlugs = BILLING_PLANS.filter((plan) => plan.monthlyPriceGhs > 0).map((plan) => plan.slug)

export const checkoutRequestSchema = z.object({
  plan: z.enum(paidPlanSlugs as [typeof paidPlanSlugs[number], ...typeof paidPlanSlugs]),
  cadence: z.literal('monthly').default('monthly'),
  paymentMethod: z.enum(['mobile_money', 'card']).default('mobile_money'),
})

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
