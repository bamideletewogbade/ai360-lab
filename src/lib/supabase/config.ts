export type SupabasePublicConfig = {
  url: string
  publishableKey: string
}

function clean(value: string | undefined) {
  return value?.trim() || ''
}

export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const publishableKey = clean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  if (!url || !publishableKey) return null
  return { url, publishableKey }
}

export function isSupabaseAuthConfigured() {
  return Boolean(supabasePublicConfig())
}

export function supabaseProjectOrigin() {
  const config = supabasePublicConfig()
  if (!config) return null
  try {
    return new URL(config.url).origin
  } catch {
    return null
  }
}
