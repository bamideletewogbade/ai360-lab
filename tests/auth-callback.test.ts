import assert from 'node:assert/strict'
import test from 'node:test'
import { isBindAllHost, isLocalHost, resolveCallbackOrigin } from '../src/lib/auth-callback.ts'

const PROD = 'https://ai360.africa'

test('a server bound to every interface (0.0.0.0) never becomes the redirect target', () => {
  // The regression: Next reported 0.0.0.0 as the request origin, so a
  // successful sign-in ended on an address no browser can reach.
  assert.equal(
    resolveCallbackOrigin({
      host: '0.0.0.0:3000',
      configuredAppUrl: PROD,
      requestUrl: 'https://0.0.0.0:3000/auth/callback',
    }),
    PROD,
  )
  assert.equal(
    resolveCallbackOrigin({
      host: 'localhost:3000',
      configuredAppUrl: PROD,
      requestUrl: 'https://0.0.0.0:3000/auth/callback',
    }),
    'http://localhost:3000',
  )
})

test('local development returns to the host the browser actually used', () => {
  for (const host of ['localhost:3000', '127.0.0.1:3000', 'localhost']) {
    assert.equal(
      resolveCallbackOrigin({ host, configuredAppUrl: PROD, requestUrl: 'http://x/auth/callback' }),
      `http://${host}`,
      `${host} should stay local`,
    )
  }
})

test('a bind-all forwarded host does not pull localhost callbacks to production', () => {
  assert.equal(
    resolveCallbackOrigin({
      forwardedHost: '0.0.0.0:3000',
      host: 'localhost:3000',
      forwardedProto: 'http',
      configuredAppUrl: PROD,
      requestUrl: 'http://0.0.0.0:3000/auth/callback',
    }),
    'http://localhost:3000',
  )
})

test('deployed requests use the canonical URL, not the proxied internal address', () => {
  assert.equal(
    resolveCallbackOrigin({
      forwardedHost: 'ai360.africa',
      host: '127.0.0.1:3000',
      forwardedProto: 'https',
      configuredAppUrl: PROD,
      requestUrl: 'http://127.0.0.1:3000/auth/callback',
    }),
    PROD,
  )
})

test('a forged host cannot redirect people off the configured origin', () => {
  assert.equal(
    resolveCallbackOrigin({
      forwardedHost: 'attacker.example',
      configuredAppUrl: PROD,
      requestUrl: 'https://ai360.africa/auth/callback',
    }),
    PROD,
  )
})

test('proxy header lists use the original client-facing value', () => {
  assert.equal(
    resolveCallbackOrigin({
      forwardedHost: 'localhost:3000, inner.proxy',
      forwardedProto: 'http, http',
      configuredAppUrl: PROD,
      requestUrl: 'http://inner.proxy/auth/callback',
    }),
    'http://localhost:3000',
  )
})

test('without configuration it still produces a usable origin', () => {
  assert.equal(
    resolveCallbackOrigin({ forwardedHost: 'ai360.africa', requestUrl: 'http://127.0.0.1/auth/callback' }),
    'https://ai360.africa',
  )
  assert.equal(
    resolveCallbackOrigin({ requestUrl: 'https://ai360.africa/auth/callback' }),
    PROD,
  )
  assert.equal(
    resolveCallbackOrigin({
      forwardedHost: 'ai360.africa',
      configuredAppUrl: 'not a url',
      requestUrl: 'http://127.0.0.1/auth/callback',
    }),
    'https://ai360.africa',
    'malformed configuration must not break sign-in',
  )
})

test('loopback addresses are recognised as local', () => {
  for (const host of ['localhost', 'LOCALHOST:3000', '127.0.0.1:8080', '[::1]']) {
    assert.equal(isLocalHost(host), true, `${host} should be local`)
  }
  for (const host of ['ai360.africa', 'localhost.attacker.com', '10.0.0.5', '0.0.0.0', '0.0.0.0:3000']) {
    assert.equal(isLocalHost(host), false, `${host} should not be local`)
  }
})

test('bind-all addresses are recognised as server listen addresses', () => {
  for (const host of ['0.0.0.0', '0.0.0.0:3000', '[::]', '::']) {
    assert.equal(isBindAllHost(host), true, `${host} should be bind-all`)
  }
  for (const host of ['localhost:3000', '127.0.0.1:3000', 'ai360.africa']) {
    assert.equal(isBindAllHost(host), false, `${host} should not be bind-all`)
  }
})
