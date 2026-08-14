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
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      if (!isMissingSession(error)) logEvent('warn', 'auth.context_unavailable', errorDetails(error))
      return null
    }
    const user = data.user
    if (!user?.id) return null

    return createWorkspaceAuthContext({
      userId: user.id,
      email: user.email ?? null,
      displayName: authDisplayName(user),
      imageUrl: authImageUrl(user),
    })
  } catch (error) {
    logEvent('error', 'auth.context_resolution_failed', errorDetails(error))
    return null
  }
}

export async function getOptionalUserId() {
  return (await getOptionalAuthContext())?.userId ?? null
}
