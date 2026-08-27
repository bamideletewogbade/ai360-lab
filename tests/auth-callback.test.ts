import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isBindAllHost, isLocalHost, resolveCallbackOrigin, safeInternalPath } from '../src/lib/auth-callback.ts'

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

test('post-auth redirects stay inside AI360', () => {
  assert.equal(safeInternalPath('/checkout?plan=everyday'), '/checkout?plan=everyday')
  assert.equal(safeInternalPath('//attacker.example'), '/app')
  assert.equal(safeInternalPath('/\\attacker.example'), '/app')
  assert.equal(safeInternalPath('https://attacker.example'), '/app')
  assert.equal(safeInternalPath(null), '/app')
})

test('an emailed invitation link can actually complete a session', async () => {
  // The callback used to read only `code`. An OAuth round trip has one; an
  // invitation minted server-side does not, because there is no PKCE verifier
  // for a link the browser never started. So an invited participant fell
  // straight through to `callback_failed`, arrived signed out, and
  // `claimInvitationOnSignIn` never ran — their credits and membership waited
  // on a sign-in the app did not believe had happened.
  const route = await readFile(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8')
  assert.match(route, /token_hash/, 'the callback must accept an emailed token')
  assert.match(route, /verifyOtp/, 'an emailed token is redeemed with verifyOtp, not a code exchange')
  assert.match(route, /exchangeCodeForSession/, 'OAuth must keep working')

  // `type` arrives in a URL anyone can edit, so it is matched against a list
  // rather than passed through.
  assert.match(route, /EMAIL_OTP_TYPES/)
  assert.doesNotMatch(route, /type: *(url|searchParams)/, 'type must never reach verifyOtp unchecked')

  // Whichever way in was used, the claim has to fire on it.
  assert.match(route, /claimInvitationOnSignIn/)
})

test('the invitation email points at our own callback, not Supabase verify', async () => {
  const inviteRoute = await readFile(new URL('../src/app/api/admin/participants/invite/route.ts', import.meta.url), 'utf8')
  const admin = await readFile(new URL('../src/lib/supabase/admin.ts', import.meta.url), 'utf8')

  // Supabase's /verify hands the session back in the URL fragment, which no
  // server route can read.
  assert.match(admin, /hashed_token/, 'the hashed token must be returned for our own callback to verify')
  assert.match(inviteRoute, /token_hash=/, 'the emailed button must carry the token to our callback')
  assert.match(inviteRoute, /type=invite/)
  assert.match(inviteRoute, /actionUrl,/, 'the built URL must be what the email actually sends')

  // The funnel tag has to survive the round trip or every invited visit lands
  // unattributed.
  assert.match(inviteRoute, /FUNNEL_INVITATION_PARAM/)
  assert.match(inviteRoute, /next=\$\{encodeURIComponent\(landing\)\}/)
})

