#!/usr/bin/env node

/**
 * Credentialed ExpressPay sandbox probe.
 *
 * This creates a hosted sandbox checkout and immediately verifies that its
 * token can be queried. It never enters card or Mobile Money credentials and
 * therefore cannot complete or charge the transaction.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

if (process.env.EXPRESSPAY_ENV !== 'sandbox') {
  throw new Error('Refusing to probe ExpressPay unless EXPRESSPAY_ENV=sandbox.')
}
if (!process.env.EXPRESSPAY_MERCHANT_ID?.trim() || !process.env.EXPRESSPAY_API_KEY?.trim()) {
  throw new Error('Add ExpressPay sandbox merchant credentials before running this probe.')
}

const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://ai360.africa').origin
if (!appOrigin.startsWith('https://')) throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS.')

const { createExpressPayProvider } = await import('../src/lib/payments/expresspay.ts')
const orderId = `pay_probe_${Date.now()}_${randomBytes(5).toString('hex')}`
const provider = createExpressPayProvider()

console.log('ExpressPay credentialed sandbox probe')
console.log(`Creating a hosted-checkout probe for ${orderId}...`)

try {
  const checkout = await provider.createCheckout({
  idempotencyKey: orderId,
  workspaceKey: 'user:expresspay_probe',
  ownerId: 'user_expresspay_probe',
  planSlug: 'probe',
  amountMinor: 100,
  currency: 'GHS',
  cadence: 'monthly',
  preferredMethod: 'mobile_money',
  customer: {
    firstName: 'AI360',
    lastName: 'Sandbox',
    email: 'payments-test@aithreesixty.tech',
    phone: '233244444444',
  },
  returnUrl: `${appOrigin}/api/billing/expresspay/return`,
  webhookUrl: `${appOrigin}/api/billing/expresspay/notify`,
  metadata: { purpose: 'credentialed-sandbox-probe' },
  })

  const checkoutUrl = new URL(checkout.checkoutUrl)
  assert.equal(checkoutUrl.origin, 'https://sandbox.expresspaygh.com')
  assert.equal(checkout.status, 'pending')
  console.log('pass  sandbox credentials created a hosted checkout')

  const verified = await provider.queryPayment(checkout.providerReference)
  assert.equal(verified.orderId, orderId)
  assert.equal(verified.amountMinor, 100)
  assert.equal(verified.currency, 'GHS')
  assert.notEqual(verified.status, 'approved', 'A probe with no payment details must not be approved.')
  console.log(`pass  server query matched order, currency and amount (${verified.status})`)
  console.log('pass  no payment credentials were submitted and no charge was completed')
} catch (error) {
  if (error && typeof error === 'object' && error.code === 'invalid_ip') {
    console.error('BLOCKED  ExpressPay status 4: this runtime\'s outbound IP is not on the merchant allowlist.')
    console.error('Ask ExpressPay to allowlist the stable staging-server egress IP, then rerun this command there.')
    process.exitCode = 2
  } else {
    throw error
  }
}
