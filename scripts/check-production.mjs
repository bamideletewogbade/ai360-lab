import { config } from 'dotenv'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

export function evaluateProductionEnvironment(env = process.env) {
  const configured = (name) => Boolean(env[name]?.trim())
  const errors = []
  const warnings = []
  const requireValue = (name, reason) => {
    if (!configured(name)) errors.push(`${name}: ${reason}`)
  }
  const requireFlag = (name) => {
    if (!['true', 'false'].includes(env[name] || '')) errors.push(`${name}: set explicitly to true or false`)
  }
  const requireHttps = (name, reason) => {
    if (!configured(name)) return requireValue(name, reason)
    try {
      const url = new URL(env[name])
      if (url.protocol !== 'https:' || url.username || url.password) errors.push(`${name}: must be a credential-free HTTPS URL`)
    } catch { errors.push(`${name}: must be a valid absolute URL`) }
  }

  const deployment = env.AI360_DEPLOYMENT_ENV || 'production'
  if (!['staging', 'production'].includes(deployment)) errors.push('AI360_DEPLOYMENT_ENV: must be staging or production')

  requireValue('OPENROUTER_API_KEY', 'required for chat, Agent and Studio')
  requireHttps('NEXT_PUBLIC_APP_URL', 'set the canonical deployment URL')
  if (configured('NEXT_PUBLIC_APP_URL')) {
    try {
      const url = new URL(env.NEXT_PUBLIC_APP_URL)
      if (url.pathname !== '/' || url.search || url.hash) errors.push('NEXT_PUBLIC_APP_URL: use the origin without a path, query or fragment')
      if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) errors.push('NEXT_PUBLIC_APP_URL: cannot use a local hostname for deployment')
    } catch { /* requireHttps already records this */ }
  }

  requireValue('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'required for browser authentication')
  requireValue('CLERK_SECRET_KEY', 'required for server authentication')
  requireValue('CLERK_WEBHOOK_SIGNING_SECRET', 'required for verified identity synchronization')
  if (!configured('CLERK_AUTHORIZED_PARTIES')) warnings.push('CLERK_AUTHORIZED_PARTIES is not set; production-safe AI360 defaults will be used.')

  requireValue('DATABASE_URL', 'use the Supabase session-pooler connection string on Hostinger')
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(env.DATABASE_URL || '')) {
    warnings.push('DATABASE_URL points at the direct Supabase host. Use the session pooler unless the host has confirmed IPv6.')
  }
  if (!configured('DIRECT_URL')) warnings.push('DIRECT_URL is absent. Migrations need a separate reviewed connection or the session pooler override.')
  const poolSize = Number(env.DATABASE_POOL_SIZE || 5)
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 10) errors.push('DATABASE_POOL_SIZE: use an integer from 1 to 10')
  if ((env.DATABASE_SSL || 'require') !== 'require') errors.push('DATABASE_SSL: production and staging must use require')

  for (const flag of ['NEXT_PUBLIC_BILLING_ENABLED', 'AI360_BROWSER_PILOT_ENABLED', 'NEXT_PUBLIC_AI360_TEAM_WORKSPACES', 'EMAIL_ENABLED']) requireFlag(flag)

  if (env.EMAIL_ENABLED === 'true') {
    requireValue('RESEND_API_KEY', 'required when transactional email is enabled')
    if (env.EMAIL_PROVIDER && env.EMAIL_PROVIDER !== 'resend') errors.push('EMAIL_PROVIDER: only "resend" is supported')
    const from = (env.EMAIL_FROM || '').trim()
    if (!/^(?:[^<>]{1,64}<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}>?$/.test(from)) {
      errors.push('EMAIL_FROM: set a verified sender address, optionally as "Name <address>"')
    }
    if (env.EMAIL_REPLY_TO && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(env.EMAIL_REPLY_TO.trim())) {
      errors.push('EMAIL_REPLY_TO: must be a bare email address when set')
    }
  } else {
    warnings.push('Transactional email is disabled. Receipts, welcome and alert mail will not send until EMAIL_ENABLED=true with a verified Resend domain.')
  }

  if (env.NEXT_PUBLIC_BILLING_ENABLED === 'true') {
    for (const name of ['EXPRESSPAY_MERCHANT_ID', 'EXPRESSPAY_API_KEY']) requireValue(name, 'required when billing is enabled')
    if (env.PAYMENTS_PROVIDER !== 'expresspay') errors.push('PAYMENTS_PROVIDER: must be expresspay when billing is enabled')
    const expected = deployment === 'production' ? 'live' : 'sandbox'
    if (env.EXPRESSPAY_ENV !== expected) errors.push(`EXPRESSPAY_ENV: ${deployment} billing must use ${expected}`)
  } else {
    warnings.push('Billing is disabled. Keep it disabled until checkout, callback and server verification pass in sandbox.')
  }

  if (env.AI360_BROWSER_PILOT_ENABLED === 'true') {
    for (const name of [
      'BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID', 'BROWSERBASE_NAVIGATE_FUNCTION_ID',
      'AI360_BROWSER_PILOT_USER_IDS', 'AI360_BROWSER_ALLOWED_DOMAINS',
      'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PRIVATE_BUCKET',
      'AI360_BROWSER_CLEANUP_SECRET',
    ]) requireValue(name, 'required when the browser pilot is enabled')
    const retention = Number(env.AI360_BROWSER_SCREENSHOT_RETENTION_HOURS || 24)
    if (!Number.isInteger(retention) || retention < 1 || retention > 168) errors.push('AI360_BROWSER_SCREENSHOT_RETENTION_HOURS: use an integer from 1 to 168')
    if ((env.AI360_BROWSER_CLEANUP_SECRET || '').length < 24) errors.push('AI360_BROWSER_CLEANUP_SECRET: use at least 24 random characters')
  } else {
    warnings.push('Browser work is disabled. Enable it only for named pilot users after publishing and evaluating the worker.')
  }

  if (configured('AI360_ERROR_ALERT_WEBHOOK_URL')) requireHttps('AI360_ERROR_ALERT_WEBHOOK_URL', 'use an HTTPS monitoring webhook')
  else warnings.push('No external error webhook is configured. Errors remain available in structured runtime logs.')

  for (const name of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(?:SECRET|PRIVATE|PASSWORD|ACCESS_TOKEN|API_KEY)/i.test(name) && configured(name)) {
      errors.push(`${name}: a sensitive-looking value must not be exposed to the browser bundle`)
    }
  }

  return { deployment, errors, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { deployment, errors, warnings } = evaluateProductionEnvironment()
  console.log(`AI360 Lab ${deployment} preflight`)
  for (const warning of warnings) console.log(`WARN  ${warning}`)
  for (const error of errors) console.error(`ERROR ${error}`)
  console.log(errors.length ? `BLOCKED (${errors.length} issue${errors.length === 1 ? '' : 's'})` : 'READY')
  process.exitCode = errors.length ? 1 : 0
}
