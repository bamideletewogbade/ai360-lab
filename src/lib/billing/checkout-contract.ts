import { z } from 'zod'
import { BILLING_PLANS } from '@/lib/billing/catalog'

const paidPlanSlugs = BILLING_PLANS.filter((plan) => plan.monthlyPriceGhs > 0).map((plan) => plan.slug)

export const checkoutRequestSchema = z.object({
  plan: z.enum(paidPlanSlugs as [typeof paidPlanSlugs[number], ...typeof paidPlanSlugs]),
  cadence: z.literal('monthly').default('monthly'),
  paymentMethod: z.enum(['mobile_money', 'card']).default('mobile_money'),
  phone: z.string().trim().min(10).max(20).transform((value, context) => {
    const digits = value.replace(/\D/g, '')
    const normalized = digits.startsWith('233')
      ? digits
      : digits.startsWith('0')
        ? `233${digits.slice(1)}`
        : ''
    if (!/^233\d{9}$/.test(normalized)) {
      context.addIssue({ code: 'custom', message: 'Enter a valid Ghana phone number.' })
      return z.NEVER
    }
    return normalized
  }),
})

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
