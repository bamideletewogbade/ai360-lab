import assert from 'node:assert/strict'
import test from 'node:test'
import { isLocalHost, resolveCallbackOrigin } from '../src/lib/auth-callback.ts'

const PROD = 'https://ai360.africa'

test('a server bound to every interface never becomes the redirect target', () => {
  // The regression: Next reported 0.0.0.0 as the request origin, so a
  // successful sign-in ended on an address no browser can reach.
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

test('loopback and unspecified addresses are recognised as local', () => {
  for (const host of ['localhost', 'LOCALHOST:3000', '127.0.0.1:8080', '[::1]', '0.0.0.0:3000']) {
    assert.equal(isLocalHost(host), true, `${host} should be local`)
  }
  for (const host of ['ai360.africa', 'localhost.attacker.com', '10.0.0.5']) {
    assert.equal(isLocalHost(host), false, `${host} should not be local`)
  }
})
