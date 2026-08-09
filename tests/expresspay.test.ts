import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createExpressPayProvider, ExpressPayError, parseGhsMinor } from '../src/lib/payments/expresspay.ts'

function providerInput() {
  return {
    idempotencyKey: 'pay_1234567890abcdef',
    workspaceKey: 'user:test',
    ownerId: 'test',
    planSlug: 'everyday',
    amountMinor: 12_500,
    currency: 'GHS' as const,
    cadence: 'monthly' as const,
    preferredMethod: 'mobile_money' as const,
    customer: {
      firstName: 'Ama',
      lastName: 'Mensah',
      email: 'ama@example.com',
      phone: '233240000000',
    },
    returnUrl: 'https://lab.aithreesixty.tech/api/billing/expresspay/return',
    webhookUrl: 'https://lab.aithreesixty.tech/api/billing/expresspay/notify',
    metadata: {},
  }
}

function withConfig() {
  const previous = {
    environment: process.env.EXPRESSPAY_ENV,
    merchantId: process.env.EXPRESSPAY_MERCHANT_ID,
    apiKey: process.env.EXPRESSPAY_API_KEY,
  }
  process.env.EXPRESSPAY_ENV = 'sandbox'
  process.env.EXPRESSPAY_MERCHANT_ID = 'merchant-test'
  process.env.EXPRESSPAY_API_KEY = 'secret-test'
  return () => {
    if (previous.environment === undefined) delete process.env.EXPRESSPAY_ENV
    else process.env.EXPRESSPAY_ENV = previous.environment
    if (previous.merchantId === undefined) delete process.env.EXPRESSPAY_MERCHANT_ID
    else process.env.EXPRESSPAY_MERCHANT_ID = previous.merchantId
    if (previous.apiKey === undefined) delete process.env.EXPRESSPAY_API_KEY
    else process.env.EXPRESSPAY_API_KEY = previous.apiKey
  }
}

test('hosted checkout sends the secret only to the sandbox submit endpoint', { concurrency: false }, async () => {
  const restore = withConfig()
  let calledUrl = ''
  let calledBody = ''
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(input)
    calledBody = String(init?.body)
    return Response.json({
      status: 1,
      message: 'Success',
      'order-id': 'pay_1234567890abcdef',
      token: 'safe.token_123',
    })
  }) as typeof fetch
  try {
    const result = await createExpressPayProvider(fetcher).createCheckout(providerInput())
    assert.equal(calledUrl, 'https://sandbox.expresspaygh.com/api/submit.php')
    const body = new URLSearchParams(calledBody)
    assert.equal(body.get('merchant-id'), 'merchant-test')
    assert.equal(body.get('api-key'), 'secret-test')
    assert.equal(body.get('amount'), '125.00')
    assert.equal(body.get('currency'), 'GHS')
    assert.equal(body.get('post-url'), providerInput().webhookUrl)
    assert.equal(result.checkoutUrl, 'https://sandbox.expresspaygh.com/payment?token=safe.token_123')
  } finally {
    restore()
  }
})

test('server query normalizes the verified ExpressPay result', { concurrency: false }, async () => {
  const restore = withConfig()
  const fetcher = (async () => Response.json({
    result: 1,
    'result-text': 'Approved',
    'order-id': 'pay_1234567890abcdef',
    token: 'safe.token_123',
    'transaction-id': 'txn_9001',
    currency: 'GHS',
    amount: '125.00',
    'date-processed': '8 August 2026',
  })) as typeof fetch
  try {
    const result = await createExpressPayProvider(fetcher).queryPayment('safe.token_123')
    assert.equal(result.status, 'approved')
    assert.equal(result.amountMinor, 12_500)
    assert.equal(result.providerTransactionId, 'txn_9001')
    assert.equal(result.orderId, 'pay_1234567890abcdef')
  } finally {
    restore()
  }
})

test('mismatched or malformed provider data fails closed', { concurrency: false }, async () => {
  const restore = withConfig()
  const fetcher = (async () => Response.json({
    result: 1,
    'result-text': 'Approved',
    'order-id': 'pay_1234567890abcdef',
    token: 'different-token',
    currency: 'GHS',
    amount: '125.00',
  })) as typeof fetch
  try {
    await assert.rejects(
      createExpressPayProvider(fetcher).queryPayment('safe.token_123'),
      (error: unknown) => error instanceof ExpressPayError && error.code === 'bad_response',
    )
    assert.throws(() => parseGhsMinor('12.999'), ExpressPayError)
  } finally {
    restore()
  }
})

test('payment migration and repository enforce one activation path', () => {
  const migration = readFileSync('database/postgres/0007_expresspay_foundation.sql', 'utf8')
  const repository = readFileSync('src/lib/payments/payment-repository.ts', 'utf8')
  assert.match(migration, /provider_transaction_id/)
  assert.match(migration, /where provider_transaction_id is not null/)
  assert.match(migration, /where status in \('created', 'initiating', 'pending', 'review'\)/)
  assert.match(repository, /for update/)
  assert.match(repository, /if \(attempt\.activated_at\)/)
  assert.match(repository, /activated_at = now\(\)/)
  assert.match(repository, /claimPaymentReconciliation/)
  assert.match(repository, /last_checked_at < now\(\)/)
  assert.match(repository, /payment-grant:/)
})

test('the adapter never sends card or wallet credentials through AI360', () => {
  const source = readFileSync('src/lib/payments/expresspay.ts', 'utf8')
  assert.doesNotMatch(source, /card-number|card-cvv|mobile-network|api\/direct\//)
})
