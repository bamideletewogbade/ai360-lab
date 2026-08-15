import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  VerifiedPayment,
} from '@/lib/payments/contracts'

type ExpressPayEnvironment = 'sandbox' | 'live'

type ExpressPaySubmitResponse = {
  status?: unknown
  message?: unknown
  token?: unknown
  'order-id'?: unknown
}

type ExpressPayQueryResponse = {
  result?: unknown
  'result-text'?: unknown
  'order-id'?: unknown
  token?: unknown
  'transaction-id'?: unknown
  transaction_id?: unknown
  currency?: unknown
  amount?: unknown
  'date-processed'?: unknown
}

const TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,1024}$/
const ORDER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const TRANSACTION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024

export function isExpressPayToken(value: string) {
  return TOKEN_PATTERN.test(value)
}

export function isExpressPayOrderId(value: string) {
  return ORDER_PATTERN.test(value)
}

export class ExpressPayError extends Error {
  readonly code: 'not_configured' | 'invalid_request' | 'invalid_credentials' | 'invalid_ip' | 'bad_response' | 'unavailable'

  constructor(
    code: 'not_configured' | 'invalid_request' | 'invalid_credentials' | 'invalid_ip' | 'bad_response' | 'unavailable',
    message: string,
  ) {
    super(message)
    this.name = 'ExpressPayError'
    this.code = code
  }
}

function configuredEnvironment(): ExpressPayEnvironment {
  const environment = process.env.EXPRESSPAY_ENV
  if (environment !== 'sandbox' && environment !== 'live') {
    throw new ExpressPayError('not_configured', 'ExpressPay environment is not configured.')
  }
  return environment
}

function endpoint(environment: ExpressPayEnvironment, path: string) {
  const origin = environment === 'sandbox'
    ? 'https://sandbox.expresspaygh.com'
    : 'https://expresspaygh.com'
  return `${origin}${path}`
}

function credentials() {
  const merchantId = process.env.EXPRESSPAY_MERCHANT_ID?.trim()
  const apiKey = process.env.EXPRESSPAY_API_KEY?.trim()
  if (!merchantId || !apiKey || merchantId.length > 256 || apiKey.length > 256) {
    throw new ExpressPayError('not_configured', 'ExpressPay credentials are not configured.')
  }
  return { merchantId, apiKey }
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function parseGhsMinor(value: unknown) {
  const text = typeof value === 'number' ? value.toFixed(2) : cleanText(value, 64)
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new ExpressPayError('bad_response', 'ExpressPay returned an invalid amount.')
  const minor = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) {
    throw new ExpressPayError('bad_response', 'ExpressPay returned an invalid amount.')
  }
  return minor
}

async function postForm<T>(url: string, body: URLSearchParams, fetcher: typeof fetch): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ExpressPayError('unavailable', 'ExpressPay could not be reached.')
  }
  if (!response.ok) {
    throw new ExpressPayError('unavailable', `ExpressPay returned HTTP ${response.status}.`)
  }
  try {
    const payload = await response.text()
    if (new TextEncoder().encode(payload).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Error('response_too_large')
    }
    return JSON.parse(payload) as T
  } catch {
    throw new ExpressPayError('bad_response', 'ExpressPay returned an unreadable response.')
  }
}

function submitFailure(status: number, message: string): never {
  if (status === 2) throw new ExpressPayError('invalid_credentials', 'ExpressPay rejected the credentials.')
  if (status === 3) throw new ExpressPayError('invalid_request', message || 'ExpressPay rejected the request.')
  if (status === 4) throw new ExpressPayError('invalid_ip', 'ExpressPay rejected this server address.')
  throw new ExpressPayError('bad_response', message || 'ExpressPay did not create the checkout.')
}

export function createExpressPayProvider(fetcher: typeof fetch = fetch): PaymentProvider {
  return {
    name: 'expresspay',

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
      const environment = configuredEnvironment()
      const { merchantId, apiKey } = credentials()
      if (!ORDER_PATTERN.test(input.idempotencyKey)) {
        throw new ExpressPayError('invalid_request', 'The payment order ID is invalid.')
      }
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new ExpressPayError('invalid_request', 'The checkout amount is invalid.')
      }
      for (const callback of [input.returnUrl, input.webhookUrl]) {
        try {
          if (new URL(callback).protocol !== 'https:') throw new Error('not_https')
        } catch {
          throw new ExpressPayError('invalid_request', 'ExpressPay callbacks must use HTTPS.')
        }
      }

      const body = new URLSearchParams({
        'merchant-id': merchantId,
        'api-key': apiKey,
        firstname: input.customer.firstName.slice(0, 32),
        lastname: input.customer.lastName.slice(0, 64),
        email: input.customer.email.slice(0, 64),
        username: input.customer.email.slice(0, 64),
        currency: input.currency,
        amount: (input.amountMinor / 100).toFixed(2),
        'order-id': input.idempotencyKey,
        'order-desc': (input.description ?? `AI360 ${input.planSlug} monthly plan`).slice(0, 256),
        'redirect-url': input.returnUrl,
        'post-url': input.webhookUrl,
      })

      const result = await postForm<ExpressPaySubmitResponse>(
        endpoint(environment, '/api/submit.php'),
        body,
        fetcher,
      )
      const status = Number(result.status)
      const message = cleanText(result.message, 256)
      if (status !== 1) submitFailure(status, message)

      const token = cleanText(result.token, 1024)
      const orderId = cleanText(result['order-id'], 64)
      if (!TOKEN_PATTERN.test(token) || orderId !== input.idempotencyKey) {
        throw new ExpressPayError('bad_response', 'ExpressPay returned an invalid checkout token.')
      }

      return {
        provider: 'expresspay',
        providerReference: token,
        checkoutUrl: `${endpoint(environment, '/payment')}?token=${encodeURIComponent(token)}`,
        status: 'pending',
      }
    },

    async queryPayment(providerReference: string): Promise<VerifiedPayment> {
      const environment = configuredEnvironment()
      const { merchantId, apiKey } = credentials()
      if (!TOKEN_PATTERN.test(providerReference)) {
        throw new ExpressPayError('invalid_request', 'The payment reference is invalid.')
      }

      const result = await postForm<ExpressPayQueryResponse>(
        endpoint(environment, '/api/query.php'),
        new URLSearchParams({
          'merchant-id': merchantId,
          'api-key': apiKey,
          token: providerReference,
        }),
        fetcher,
      )
      const providerResult = Number(result.result)
      const status = providerResult === 1
        ? 'approved'
        : providerResult === 2
          ? 'declined'
          : providerResult === 4
            ? 'pending'
            : 'failed'
      const orderId = cleanText(result['order-id'], 64)
      const token = cleanText(result.token, 1024)
      const providerTransactionId = cleanText(result['transaction-id'] ?? result.transaction_id, 128)
      const currency = cleanText(result.currency, 3)
      if (!ORDER_PATTERN.test(orderId) || token !== providerReference || currency !== 'GHS') {
        throw new ExpressPayError('bad_response', 'ExpressPay returned mismatched payment details.')
      }
      if (providerResult === 1 && !TRANSACTION_PATTERN.test(providerTransactionId)) {
        throw new ExpressPayError('bad_response', 'ExpressPay approved a payment without a valid transaction ID.')
      }

      return {
        provider: 'expresspay',
        providerReference,
        providerTransactionId: providerTransactionId || null,
        orderId,
        status,
        statusText: cleanText(result['result-text'], 256) || 'Unknown',
        amountMinor: parseGhsMinor(result.amount),
        currency: 'GHS',
        processedAt: cleanText(result['date-processed'], 64) || null,
      }
    },
  }
}
