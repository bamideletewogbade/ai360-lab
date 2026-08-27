import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The service-role Supabase client, for the few operations that act on an
 * identity other than the caller's.
 *
 * `server.ts` builds the cookie-bound client that answers "who is asking"; this
 * one holds the secret key and can therefore mint an invitation link for
 * somebody who has no session and no account yet. It is deliberately a separate
 * module so that the privileged key never sits one import away from request
 * handling, and every caller has to name what it needs it for.
 *
 * Like billing and the browser pilot, it stays dark until its credential is
 * present rather than failing at the point of use.
 */

let client: SupabaseClient | null = null

function adminConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  return url && secret ? { url, secret } : null
}

export function isSupabaseAdminConfigured() {
  return Boolean(adminConfiguration())
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (client) return client
  const configuration = adminConfiguration()
  if (!configuration) throw new Error('The Supabase service role key is not configured.')
  client = createClient(configuration.url, configuration.secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return client
}

/**
 * Mints a sign-up link for an address with no account, without sending
 * anything. Supabase's own `inviteUserByEmail` would deliver its default
 * template; taking only the link lets the invitation go out through the
 * branded participant template and be recorded in the invitation ledger like
 * every other message the module sends.
 *
 * Returns `hashedToken` as well as Supabase's own `action_link`, because the
 * two lead to different places. `action_link` points at Supabase's `/verify`
 * endpoint, which finishes by handing the session back in the URL *fragment* —
 * unreadable by a server route, and not what an `@supabase/ssr` browser client
 * looks for either, since it expects a PKCE `code` that a server-minted link
 * never carries. An invitation built on it lands the recipient on the app
 * signed out. The hashed token can instead be verified directly by our own
 * callback, which is the documented pattern for server-rendered apps and the
 * only one that produces a real session for an invited person.
 *
 * Returns null when Supabase declines — most often because the address already
 * has an account, which the caller treats as "already a user", not an error.
 */
export async function generateInviteLink(input: {
  email: string
  redirectTo: string
}): Promise<{ link: string; hashedToken: string | null } | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: { redirectTo: input.redirectTo },
  })
  if (error || !data?.properties?.action_link) return null
  return {
    link: data.properties.action_link,
    hashedToken: data.properties.hashed_token || null,
  }
}
