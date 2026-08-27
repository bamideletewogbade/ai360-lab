import 'server-only'
import { authDisplayName, authImageUrl } from '@/lib/auth-profile'
import { errorDetails, logEvent } from '@/lib/observability'
import {
  createWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from '@/lib/workspace'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function isAuthConfigured() {
  return isSupabaseAuthConfigured()
}

function isMissingSession(error: { name?: string; code?: string }) {
  return error.name === 'AuthSessionMissingError' || error.code === 'session_not_found'
}

export async function getOptionalAuthContext(): Promise<WorkspaceAuthContext | null> {
  if (!isAuthConfigured()) return null
  try {
    const supabase = await createSupabaseServerClient()
    // getClaims() verifies the JWT locally against the cached JWKS when the
    // project uses asymmetric signing keys, unlike getUser() which always
    // makes a network round trip to the Auth server. The proxy middleware
    // already refreshed the session cookie earlier in this request, so this
    // is a second verification, not a second refresh.
    const { data, error } = await supabase.auth.getClaims()
    if (error) {
      if (!isMissingSession(error)) logEvent('warn', 'auth.context_unavailable', errorDetails(error))
      return null
    }
    const claims = data.claims
    if (!claims?.sub) return null

    return createWorkspaceAuthContext({
      userId: claims.sub,
      email: claims.email ?? null,
      displayName: authDisplayName(claims),
      imageUrl: authImageUrl(claims),
    })
  } catch (error) {
    logEvent('error', 'auth.context_resolution_failed', errorDetails(error))
    return null
  }
}

export async function getOptionalUserId() {
  return (await getOptionalAuthContext())?.userId ?? null
}
