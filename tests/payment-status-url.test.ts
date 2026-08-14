import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentStatusUrl } from '../src/lib/payments/status-url.ts'

const PROD = 'https://ai360.africa'

test('a verified return redirects to the canonical origin, never the bind-all address', () => {
  // The regression: the server bound to every interface reported 0.0.0.0 as
  // the request origin, so the 303 after ExpressPay checkout stranded the
  // customer on an address no browser can reach even though the payment
  // succeeded server-side.
  const url = paymentStatusUrl({
    host: '0.0.0.0:3000',
    configuredAppUrl: PROD,
    requestUrl: 'http://0.0.0.0:3000/api/billing/expresspay/return?order-id=pay_123&token=t',
    orderId: 'pay_123',
    check: 'retry',
  })
  assert.equal(url.origin, PROD)
  assert.equal(url.pathname, '/payment/status')
  assert.equal(url.searchParams.get('order'), 'pay_123')
  assert.equal(url.searchParams.get('check'), 'retry')
})

test('deployed returns keep the order and check parameters on the public origin', () => {
  const url = paymentStatusUrl({
    forwardedHost: 'ai360.africa',
    host: '127.0.0.1:3000',
    forwardedProto: 'https',
    configuredAppUrl: PROD,
    requestUrl: 'http://127.0.0.1:3000/api/billing/expresspay/return?order-id=pay_123&token=t',
    orderId: 'pay_123',
  })
  assert.equal(url.origin, PROD)
  assert.equal(url.pathname, '/payment/status')
  assert.equal(url.searchParams.get('order'), 'pay_123')
  assert.equal(url.searchParams.get('check'), null)
})

test('a forged host cannot move the payment redirect off the configured origin', () => {
  const url = paymentStatusUrl({
    forwardedHost: 'attacker.example',
    configuredAppUrl: PROD,
    requestUrl: 'https://ai360.africa/api/billing/expresspay/return?order-id=pay_123&token=t',
    orderId: 'pay_123',
  })
  assert.equal(url.origin, PROD)
})
