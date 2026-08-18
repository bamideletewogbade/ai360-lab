import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateProductionEnvironment } from '../scripts/check-production.mjs'
import { runDeploymentSmoke } from '../scripts/smoke-deployment.mjs'
import { resolveDeploymentId } from '../scripts/build.mjs'
import { ASSET_RECOVERY_SCRIPT } from '../src/lib/asset-recovery.ts'
import { readFile } from 'node:fs/promises'

function releaseEnvironment() {
  return {
    NODE_ENV: 'production' as const,
    AI360_DEPLOYMENT_ENV: 'production',
    OPENROUTER_API_KEY: 'server-key',
    NEXT_PUBLIC_APP_URL: 'https://ai360.africa',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
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
    EMAIL_FROM: 'AI360 <noreply@ai360.africa>',
  })
  assert.deepEqual(configured.errors, [])
})

test('sensitive-looking public variables block a release', () => {
  const result = evaluateProductionEnvironment({ ...releaseEnvironment(), NEXT_PUBLIC_PAYMENT_API_KEY: 'secret' })
  assert.match(result.errors.join('\n'), /must not be exposed to the browser bundle/)
})

test('the build automatically uses the checked-out Git commit as its deployment ID', () => {
  assert.equal(resolveDeploymentId({}, () => 'abc123def456\n'), 'abc123def456')
})

test('CI can override the automatic deployment ID without changing production configuration', () => {
  assert.equal(resolveDeploymentId({ AI360_DEPLOYMENT_ID_OVERRIDE: 'release/abc 123' }, () => 'ignored'), 'release-abc-123')
})

test('a missing Next.js chunk forces one cache-busted workspace reload', () => {
  let onError: ((event: unknown) => void) | undefined
  let replacedWith = ''
  const storage = new Map<string, string>()
  const location = {
    pathname: '/app',
    href: 'https://ai360.africa/app',
    replace(value: string) { replacedWith = value },
  }
  const sessionStorage = {
    getItem(key: string) { return storage.get(key) ?? null },
    setItem(key: string, value: string) { storage.set(key, value) },
    removeItem(key: string) { storage.delete(key) },
  }
  const addEventListener = (name: string, listener: (event: unknown) => void) => {
    if (name === 'error') onError = listener
  }

  const installRecovery = new Function('location', 'sessionStorage', 'document', 'addEventListener', ASSET_RECOVERY_SCRIPT)
  installRecovery(location, sessionStorage, {}, addEventListener)
  assert.ok(onError)
  onError({ target: { tagName: 'SCRIPT', src: 'https://ai360.africa/_next/static/chunks/missing.js' } })

  assert.match(replacedWith, /^https:\/\/ai360\.africa\/app\?_fresh=\d+$/)
  assert.ok(storage.has('ai360:asset-recovery:/app'))
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

test('the operator spend report uses the unified ledger that includes video jobs', async () => {
  const report = await readFile(new URL('../scripts/report-status-metrics.mjs', import.meta.url), 'utf8')
  assert.match(report, /from public\.lab_cost_ledger/)
  assert.doesNotMatch(report, /sum\(actual_cost_usd\)[\s\S]*from public\.lab_usage_events/)
})
