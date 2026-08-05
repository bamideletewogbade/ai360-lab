export type ReadinessCheck = {
  key: string
  status: 'ready' | 'missing' | 'invalid' | 'pending'
  required: boolean
  message: string
}

function configured(name: string) {
  return Boolean(process.env[name]?.trim())
}

function validUrl(value: string | undefined, requireHttps: boolean) {
  try {
    const url = new URL(value || '')
    return !requireHttps || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Supabase Postgres is the only data plane. MySQL was retired on 2026-08-05
 * once every route had been ported; see DECISIONS.md.
 */
export function selectedDatabaseProvider() {
  return configured('DATABASE_URL') ? 'postgres' as const : 'none' as const
}

export function productionReadinessChecks(): ReadinessCheck[] {
  const production = process.env.NODE_ENV === 'production'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.OPENROUTER_SITE_URL
  const clerkPublishable = configured('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
  const clerkSecret = configured('CLERK_SECRET_KEY')
  const databaseProvider = selectedDatabaseProvider()
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

  return [
    {
      key: 'app_url',
      status: validUrl(appUrl, production) ? 'ready' : configured('NEXT_PUBLIC_APP_URL') ? 'invalid' : 'missing',
      required: production,
      message: production ? 'A canonical HTTPS application URL is configured.' : 'A canonical application URL is recommended.',
    },
    {
      key: 'ai_gateway',
      status: configured('OPENROUTER_API_KEY') ? 'ready' : 'missing',
      required: true,
      message: 'The server-side AI gateway key is configured.',
    },
    {
      key: 'clerk',
      status: clerkPublishable && clerkSecret ? 'ready' : clerkPublishable || clerkSecret ? 'invalid' : 'missing',
      required: true,
      message: clerkPublishable === clerkSecret
        ? 'Clerk publishable and secret keys are configured as a pair.'
        : 'Clerk is partially configured; both keys are required.',
    },
    {
      key: 'clerk_webhook',
      status: configured('CLERK_WEBHOOK_SIGNING_SECRET') ? 'ready' : 'missing',
      required: true,
      message: 'Clerk lifecycle events can be verified and synchronized.',
    },
    {
      key: 'database',
      status: databaseProvider === 'postgres' ? 'ready' : 'missing',
      required: true,
      message: databaseProvider === 'postgres'
        ? 'Supabase Postgres is configured and serves every application data route.'
        : 'No durable application database is configured.',
    },
    {
      key: 'payments',
      status: !billingEnabled
        ? 'pending'
        : configured('MOJOPAY_MERCHANT_ID') && configured('MOJOPAY_SECRET_KEY') && configured('MOJOPAY_WEBHOOK_SECRET')
          ? 'ready'
          : 'missing',
      required: billingEnabled,
      message: billingEnabled
        ? 'Billing is enabled and requires complete MojoPay credentials.'
        : 'Billing remains safely disabled until the provider contract and sandbox are approved.',
    },
  ]
}

export function productionReadiness() {
  const checks = productionReadinessChecks()
  const blockers = checks.filter((check) => check.required && check.status !== 'ready')
  return { ready: blockers.length === 0, blockers, checks }
}
