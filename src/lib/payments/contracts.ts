export type PaymentMethod = 'mobile_money' | 'card'
export type PaymentCadence = 'monthly'

export type CreateCheckoutInput = {
  idempotencyKey: string
  workspaceKey: string
  ownerId: string
  planSlug: string
  amountMinor: number
  currency: 'GHS'
  cadence: PaymentCadence
  preferredMethod: PaymentMethod
  customer: { email: string; phone: string; firstName: string; lastName: string }
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

export type VerifiedPayment = {
  provider: string
  providerReference: string
  providerTransactionId: string | null
  orderId: string
  status: 'approved' | 'declined' | 'pending' | 'failed'
  statusText: string
  amountMinor: number
  currency: 'GHS'
  processedAt: string | null
}

export interface PaymentProvider {
  readonly name: string
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>
  queryPayment(providerReference: string): Promise<VerifiedPayment>
}

export function isPaymentProviderConfigured() {
  return Boolean(
    process.env.PAYMENTS_PROVIDER === 'expresspay' &&
      (process.env.EXPRESSPAY_ENV === 'sandbox' || process.env.EXPRESSPAY_ENV === 'live') &&
      process.env.EXPRESSPAY_API_KEY &&
      process.env.EXPRESSPAY_MERCHANT_ID,
  )
}
