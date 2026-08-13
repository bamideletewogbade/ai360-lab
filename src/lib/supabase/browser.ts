'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from '@/lib/supabase/config'

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  const config = supabasePublicConfig()
  if (!config) throw new Error('Supabase Auth is not configured.')
  browserClient ??= createBrowserClient(config.url, config.publishableKey)
  return browserClient
}
