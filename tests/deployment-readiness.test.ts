import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateProductionEnvironment } from '../scripts/check-production.mjs'
import { runDeploymentSmoke } from '../scripts/smoke-deployment.mjs'

function releaseEnvironment() {
  return {
    NODE_ENV: 'production' as const,
    AI360_DEPLOYMENT_ENV: 'production',
    OPENROUTER_API_KEY: 'server-key',
    NEXT_PUBLIC_APP_URL: 'https://lab.aithreesixty.tech',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_example',
    CLERK_AUTHORIZED_PARTIES: 'https://aithreesixty.tech,https://lab.aithreesixty.tech',
    DATABASE_URL: 'postgresql://pooler.example.com:5432/postgres',
    DIRECT_URL: 'postgresql://migration.example.com:5432/postgres',
    DATABASE_POOL_SIZE: '5',
    DATABASE_SSL: 'require',
    NEXT_PUBLIC_BILLING_ENABLED: 'false',
    AI360_BROWSER_PILOT_ENABLED: 'false',
    NEXT_PUBLIC_AI360_TEAM_WORKSPACES: 'false',
    EMAIL_ENABLED: 'false',
  }
}

test('the core release can pass while risky capabilities remain explicitly disabled', () => {
  const result = evaluateProductionEnvironment(releaseEnvironment())
  assert.deepEqual(result.errors, [])
  assert.match(result.warnings.join('\n'), /Billing is disabled/)
  assert.match(result.warnings.join('\n'), /Browser work is disabled/)
})

test('enabling browser work requires the complete worker and cleanup boundary', () => {
  const environment = { ...releaseEnvironment(), AI360_BROWSER_PILOT_ENABLED: 'true' }
  const result = evaluateProductionEnvironment(environment)
  for (const name of ['BROWSERBASE_API_KEY', 'BROWSERBASE_NAVIGATE_FUNCTION_ID', 'AI360_BROWSER_CLEANUP_SECRET']) {
    assert.match(result.errors.join('\n'), new RegExp(name))
  }
})

test('enabling transactional email requires a provider key and a valid sender', () => {
  const enabled = evaluateProductionEnvironment({ ...releaseEnvironment(), EMAIL_ENABLED: 'true' })
  assert.match(enabled.errors.join('\n'), /RESEND_API_KEY/)
  assert.match(enabled.errors.join('\n'), /EMAIL_FROM/)

  const configured = evaluateProductionEnvironment({
    ...releaseEnvironment(),
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 're_live_example',
    EMAIL_FROM: 'AI360 Lab <lab@aithreesixty.tech>',
  })
  assert.deepEqual(configured.errors, [])
})

test('sensitive-looking public variables block a release', () => {
  const result = evaluateProductionEnvironment({ ...releaseEnvironment(), NEXT_PUBLIC_PAYMENT_API_KEY: 'secret' })
  assert.match(result.errors.join('\n'), /must not be exposed to the browser bundle/)
})

test('deployed smoke checks cover readiness, headers, private workspace indexing and discovery files', async () => {
  const headers = {
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=()',
    'Strict-Transport-Security': 'max-age=31536000',
  }
  const request = async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname
    if (path === '/api/health') return Response.json({ status: 'ok', requestId: 'req_1' }, { headers: { ...headers, 'Cache-Control': 'no-store', 'X-Request-Id': 'req_1' } })
    if (path === '/api/ready') return Response.json({ status: 'ready', databaseConnection: 'connected' }, { headers })
    if (['/robots.txt', '/sitemap.xml', '/llms.txt', '/manifest.webmanifest'].includes(path)) return new Response('published discovery content for AI360', { headers })
    return new Response(`<html><head>${path === '/app' ? '<meta name="robots" content="noindex,nofollow">' : ''}</head><body>AI360</body></html>`, { headers })
  }
  const result = await runDeploymentSmoke('https://staging.example.com', request as typeof fetch)
  assert.equal(result.passed, true)
})
