import { z } from 'zod'
import { BILLING_PLANS, CREDIT_TOP_UPS } from '@/lib/billing/catalog'

const paidPlanSlugs = BILLING_PLANS.filter((plan) => plan.monthlyPriceGhs > 0).map((plan) => plan.slug)
const topUpSlugs = CREDIT_TOP_UPS.map((topUp) => topUp.slug)

/**
 * One purchase shape, two item kinds: a monthly plan (access plus monthly
 * allowance) or a one-time credit top-up (purchased credits only, no access,
 * no renewal). Exactly one of `plan` / `topup` must be present.
 */
export const checkoutRequestSchema = z
  .object({
    plan: z.enum(paidPlanSlugs as [typeof paidPlanSlugs[number], ...typeof paidPlanSlugs]).optional(),
    topup: z.enum(topUpSlugs as [typeof topUpSlugs[number], ...typeof topUpSlugs]).optional(),
    cadence: z.literal('monthly').default('monthly'),
    paymentMethod: z.enum(['mobile_money', 'card']).default('mobile_money'),
  })
  .refine((value) => (value.plan ? 1 : 0) + (value.topup ? 1 : 0) === 1, {
    message: 'Choose exactly one item: a plan or a credit top-up.',
  })

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
