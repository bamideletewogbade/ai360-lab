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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabasePublishable = configured('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    || configured('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const supabaseAuthReady = supabasePublishable && validUrl(supabaseUrl, production)
  const databaseProvider = selectedDatabaseProvider()
  // Kept as a local check rather than an import: this module is read for
  // configuration reporting and must not pull in the server-only storage client.
  const mediaStorageReady = configured('NEXT_PUBLIC_SUPABASE_URL')
    && configured('SUPABASE_SECRET_KEY')
    && configured('SUPABASE_PRIVATE_BUCKET')
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
  const paymentProviderReady = process.env.PAYMENTS_PROVIDER === 'expresspay'
    && (process.env.EXPRESSPAY_ENV === 'sandbox' || process.env.EXPRESSPAY_ENV === 'live')
    && configured('EXPRESSPAY_MERCHANT_ID')
    && configured('EXPRESSPAY_API_KEY')
  const browserEnabled = process.env.AI360_BROWSER_PILOT_ENABLED === 'true'
  const browserReady = process.env.AI360_BROWSER_PROVIDER === 'browserbase'
    && configured('BROWSERBASE_API_KEY')
    && configured('BROWSERBASE_PROJECT_ID')
    && configured('AI360_BROWSER_PILOT_USER_IDS')
    && configured('AI360_BROWSER_ALLOWED_DOMAINS')
    && configured('BROWSERBASE_NAVIGATE_FUNCTION_ID')
    && configured('NEXT_PUBLIC_SUPABASE_URL')
    && configured('SUPABASE_SECRET_KEY')
    && configured('SUPABASE_PRIVATE_BUCKET')
    && configured('AI360_BROWSER_CLEANUP_SECRET')

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
      key: 'supabase_auth',
      status: supabaseAuthReady
        ? 'ready'
        : configured('NEXT_PUBLIC_SUPABASE_URL') || supabasePublishable
          ? 'invalid'
          : 'missing',
      required: true,
      message: 'Supabase Auth is configured with a public project URL and publishable browser key.',
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
      // Studio media is paid work whose deliverable only exists once it is
      // stored. Without this, a render can finish at the provider, be charged
      // for, and still never reach the person — which is exactly what happened
      // in production while every other check reported ready.
      key: 'media_storage',
      status: mediaStorageReady
        ? 'ready'
        : configured('NEXT_PUBLIC_SUPABASE_URL') || configured('SUPABASE_SECRET_KEY') || configured('SUPABASE_PRIVATE_BUCKET')
          ? 'invalid'
          : 'missing',
      required: production,
      message: mediaStorageReady
        ? 'Generated images and videos can be stored and delivered from the private media bucket.'
        : 'Generated media cannot be delivered: the private media bucket, project URL or server secret key is missing.',
    },
    {
      key: 'payments',
      status: !billingEnabled
        ? 'pending'
        : paymentProviderReady
          ? 'ready'
          : 'missing',
      required: billingEnabled,
      message: billingEnabled
        ? 'Billing is enabled and requires complete ExpressPay hosted-checkout configuration.'
        : 'Billing remains safely disabled until an ExpressPay sandbox payment and server verification pass.',
    },
    {
      key: 'browser_pilot',
      status: !browserEnabled ? 'pending' : browserReady ? 'ready' : 'missing',
      required: browserEnabled,
      message: browserEnabled
        ? 'The closed read-only browser pilot requires its worker, private evidence storage, user allowlist and domain allowlist.'
        : 'Browser work remains safely disabled until the closed pilot is configured.',
    },
  ]
}

export function productionReadiness() {
  const checks = productionReadinessChecks()
  const blockers = checks.filter((check) => check.required && check.status !== 'ready')
  return { ready: blockers.length === 0, blockers, checks }
}
