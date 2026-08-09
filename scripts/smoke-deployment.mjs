import { pathToFileURL } from 'node:url'

const securityHeaders = [
  'content-security-policy', 'x-content-type-options', 'x-frame-options',
  'referrer-policy', 'permissions-policy', 'strict-transport-security',
]

function cleanBaseUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Smoke-test URL must be HTTP or HTTPS without credentials.')
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Remote smoke tests require HTTPS.')
  return url.origin
}

export async function runDeploymentSmoke(baseUrl, request = fetch) {
  const base = cleanBaseUrl(baseUrl)
  const results = []
  const check = (name, passed, detail = '') => {
    results.push({ name, passed, detail })
    console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const get = async (path) => request(`${base}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'AI360-Deployment-Smoke/1.0', 'X-Request-Id': `smoke-${Date.now()}` },
  })

  const health = await get('/api/health')
  const healthBody = await health.json().catch(() => null)
  check('health endpoint is alive', health.status === 200 && healthBody?.status === 'ok', `HTTP ${health.status}`)
  check('health response is never cached', /no-store/i.test(health.headers.get('cache-control') || ''))
  check('health response has a request reference', Boolean(health.headers.get('x-request-id') && healthBody?.requestId))

  const ready = await get('/api/ready')
  const readyBody = await ready.json().catch(() => null)
  check('release dependencies are ready', ready.status === 200 && readyBody?.status === 'ready', `HTTP ${ready.status}`)
  check('database is connected', readyBody?.databaseConnection === 'connected', readyBody?.databaseConnection || 'unknown')

  for (const path of ['/', '/what-you-can-make', '/how-it-works', '/pricing', '/privacy', '/terms', '/app']) {
    const response = await get(path)
    const html = await response.text()
    check(`${path} renders`, response.status === 200 && /<html/i.test(html), `HTTP ${response.status}`)
    for (const header of securityHeaders) check(`${path} sends ${header}`, Boolean(response.headers.get(header)))
    if (path === '/app') check('/app is not indexable', /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html) || /<meta[^>]+content=["'][^"']*noindex/i.test(html))
  }

  for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/manifest.webmanifest']) {
    const response = await get(path)
    const body = await response.text()
    check(`${path} is published`, response.status === 200 && body.trim().length > 20, `HTTP ${response.status}`)
  }

  const failed = results.filter((result) => !result.passed)
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`)
  return { passed: failed.length === 0, results }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] || process.env.AI360_SMOKE_BASE_URL
  if (!baseUrl) throw new Error('Pass a deployment URL or set AI360_SMOKE_BASE_URL.')
  const result = await runDeploymentSmoke(baseUrl)
  if (!result.passed) process.exitCode = 1
}
