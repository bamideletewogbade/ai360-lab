import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const configured = (name) => Boolean(process.env[name]?.trim())
const errors = []
const warnings = []

function requireValue(name, reason) {
  if (!configured(name)) errors.push(`${name}: ${reason}`)
}

requireValue('OPENROUTER_API_KEY', 'required for chat, Agent and Studio')
requireValue('NEXT_PUBLIC_APP_URL', 'set to https://lab.aithreesixty.tech')
requireValue('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'required for browser authentication')
requireValue('CLERK_SECRET_KEY', 'required for server authentication')
requireValue('CLERK_WEBHOOK_SIGNING_SECRET', 'required for verified identity synchronization')

if (configured('NEXT_PUBLIC_APP_URL')) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL)
    if (url.protocol !== 'https:') errors.push('NEXT_PUBLIC_APP_URL: production must use HTTPS')
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL: must be a valid absolute URL')
  }
}

const provider = process.env.DATABASE_PROVIDER || (configured('DATABASE_URL') ? 'postgres' : 'mysql')
if (provider === 'postgres') {
  requireValue('DATABASE_URL', 'use the Supabase session-pooler connection string on Hostinger')
  warnings.push('Supabase is prepared but the application data-route cutover is not complete; do not switch production yet.')
} else if (provider === 'mysql') {
  for (const name of ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
    requireValue(name, 'required by the current MySQL data plane')
  }
} else {
  errors.push('DATABASE_PROVIDER: must be mysql or postgres')
}

if (process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true') {
  for (const name of ['MOJOPAY_MERCHANT_ID', 'MOJOPAY_SECRET_KEY', 'MOJOPAY_WEBHOOK_SECRET']) {
    requireValue(name, 'required when billing is enabled')
  }
} else {
  warnings.push('Billing is disabled. Keep it disabled until MojoPay sandbox and signed webhooks pass.')
}

if (!configured('CLERK_AUTHORIZED_PARTIES')) {
  warnings.push('CLERK_AUTHORIZED_PARTIES is not set; production-safe AI 360 defaults will be used.')
}
if (!configured('SENTRY_DSN')) warnings.push('SENTRY_DSN is not configured; errors only appear in runtime logs.')

console.log('AI 360 Lab production preflight')
for (const warning of warnings) console.log(`WARN  ${warning}`)
for (const error of errors) console.error(`ERROR ${error}`)
console.log(errors.length ? `BLOCKED (${errors.length} issue${errors.length === 1 ? '' : 's'})` : 'READY')
process.exitCode = errors.length ? 1 : 0
