export type PaymentMethod = 'mobile_money' | 'card'
export type PaymentCadence = 'monthly' | 'annual'

export type CreateCheckoutInput = {
  idempotencyKey: string
  workspaceKey: string
  ownerId: string
  planSlug: string
  amountMinor: number
  currency: 'GHS'
  cadence: PaymentCadence
  preferredMethod: PaymentMethod
  customer: { email?: string; phone?: string }
  returnUrl: string
  webhookUrl: string
  metadata: Record<string, string>
}

export type CheckoutSession = {
  provider: string
  providerReference: string
  checkoutUrl: string
  status: 'pending'
  expiresAt?: string
}

export interface PaymentProvider {
  readonly name: string
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>
  verifyWebhook(request: Request): Promise<unknown>
}

export function isPaymentProviderConfigured() {
  return Boolean(
    process.env.PAYMENTS_PROVIDER === 'mojopay' &&
      process.env.MOJOPAY_API_BASE_URL &&
      process.env.MOJOPAY_SECRET_KEY &&
      process.env.MOJOPAY_MERCHANT_ID &&
      process.env.MOJOPAY_WEBHOOK_SECRET,
  )
}
