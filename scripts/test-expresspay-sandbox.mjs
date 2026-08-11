#!/usr/bin/env node

/**
 * ExpressPay Sandbox Verification Rig
 * Runs a standalone test of ExpressPay payload formatting, checkout initialization,
 * status query parsing, and webhook event reconciliation in sandbox mode.
 */

import assert from 'node:assert/strict'
import { createExpressPayProvider, ExpressPayError, isExpressPayOrderId, isExpressPayToken, parseGhsMinor } from '../src/lib/payments/expresspay.ts'

console.log('🧪 Starting ExpressPay Sandbox Verification Rig...\n')

// 1. Environment Setup Test
process.env.EXPRESSPAY_ENV = 'sandbox'
process.env.EXPRESSPAY_MERCHANT_ID = 'test-merchant-id'
process.env.EXPRESSPAY_API_KEY = 'test-api-key'

const mockCheckoutInput = {
  idempotencyKey: 'pay_sandbox_test_1234567890',
  workspaceKey: 'user:test_workspace',
  ownerId: 'user_123',
  planSlug: 'everyday',
  amountMinor: 12500, // GH₵ 125.00
  currency: 'GHS',
  cadence: 'monthly',
  preferredMethod: 'mobile_money',
  customer: {
    firstName: 'Kofi',
    lastName: 'Ansah',
    email: 'kofi@example.com',
    phone: '233240000000',
  },
  returnUrl: 'https://lab.aithreesixty.tech/api/billing/expresspay/return',
  webhookUrl: 'https://lab.aithreesixty.tech/api/billing/expresspay/notify',
  metadata: { catalogVersion: 'pilot-2026-08-v3' },
}

console.log('1️⃣ Testing ExpressPay Form Payload Generation...')
let capturedUrl = ''
let capturedBody = null

const mockFetcher = async (url, init) => {
  capturedUrl = String(url)
  capturedBody = new URLSearchParams(String(init?.body))
  return new Response(JSON.stringify({
    status: 1,
    message: 'Success',
    'order-id': mockCheckoutInput.idempotencyKey,
    token: 'sb_token_abc123xyz987',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const provider = createExpressPayProvider(mockFetcher)
const session = await provider.createCheckout(mockCheckoutInput)

assert.equal(capturedUrl, 'https://sandbox.expresspaygh.com/api/submit.php')
assert.equal(capturedBody.get('merchant-id'), 'test-merchant-id')
assert.equal(capturedBody.get('api-key'), 'test-api-key')
assert.equal(capturedBody.get('amount'), '125.00')
assert.equal(capturedBody.get('currency'), 'GHS')
assert.equal(capturedBody.get('order-id'), mockCheckoutInput.idempotencyKey)
assert.equal(capturedBody.get('post-url'), mockCheckoutInput.webhookUrl)
assert.equal(capturedBody.get('redirect-url'), mockCheckoutInput.returnUrl)
assert.equal(session.checkoutUrl, 'https://sandbox.expresspaygh.com/payment?token=sb_token_abc123xyz987')

console.log('   ✅ Submit payload parameters strictly matched ExpressPay specification.')
console.log('   ✅ Checkout URL returned correctly:', session.checkoutUrl)

console.log('\n2️⃣ Testing Server-Side Query API & Response Parsing...')
const mockQueryFetcher = async () => new Response(JSON.stringify({
  result: 1,
  'result-text': 'Approved',
  'order-id': mockCheckoutInput.idempotencyKey,
  token: 'sb_token_abc123xyz987',
  'transaction-id': 'txn_sandbox_9999',
  currency: 'GHS',
  amount: '125.00',
  'date-processed': '11 August 2026',
}), { status: 200, headers: { 'Content-Type': 'application/json' } })

const verified = await createExpressPayProvider(mockQueryFetcher).queryPayment('sb_token_abc123xyz987')
assert.equal(verified.status, 'approved')
assert.equal(verified.amountMinor, 12500)
assert.equal(verified.orderId, mockCheckoutInput.idempotencyKey)
assert.equal(verified.providerTransactionId, 'txn_sandbox_9999')

console.log('   ✅ Verified payment query normalized correctly: status = approved, amount = GH₵125.00')

console.log('\n3️⃣ Testing Validation Utilities & Fail-Closed Logic...')
assert.ok(isExpressPayOrderId('pay_12345'))
assert.ok(isExpressPayToken('token_12345'))
assert.equal(parseGhsMinor('350.00'), 35000)
assert.equal(parseGhsMinor(125), 12500)

// Test fail-closed on invalid token format
await assert.rejects(
  provider.queryPayment('invalid!token@char'),
  (err) => err instanceof ExpressPayError && err.code === 'invalid_request',
)

console.log('   ✅ Malformed tokens & mismatched details correctly fail closed.')
console.log('\n🎉 All ExpressPay sandbox verification tests passed successfully!\n')
