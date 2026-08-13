import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabasePublicConfig } from '@/lib/supabase/config'

export async function createSupabaseServerClient() {
  const config = supabasePublicConfig()
  if (!config) throw new Error('Supabase Auth is not configured.')

  const cookieStore = await cookies()

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Server Components can read cookies but cannot write them. The
            // Proxy refresh path writes updated Supabase cookies before render.
          }
        }
      },
    },
  })
}
