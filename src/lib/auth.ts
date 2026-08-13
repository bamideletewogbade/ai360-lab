import 'server-only'
import type { User } from '@supabase/supabase-js'
import {
  createWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from '@/lib/workspace'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function isAuthConfigured() {
  return isSupabaseAuthConfigured()
}

function stringMetadata(user: User, key: string) {
  const value = (user.user_metadata as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function displayName(user: User) {
  return stringMetadata(user, 'full_name')
    || stringMetadata(user, 'name')
    || [stringMetadata(user, 'first_name'), stringMetadata(user, 'last_name')].filter(Boolean).join(' ')
    || null
}

function imageUrl(user: User) {
  return stringMetadata(user, 'avatar_url') || stringMetadata(user, 'picture')
}

export async function getOptionalAuthContext(): Promise<WorkspaceAuthContext | null> {
  if (!isAuthConfigured()) return null
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  const user = error ? null : data.user
  if (!user?.id) return null

  return createWorkspaceAuthContext({
    userId: user.id,
    email: user.email ?? null,
    displayName: displayName(user),
    imageUrl: imageUrl(user),
  })
}

export async function getOptionalUserId() {
  return (await getOptionalAuthContext())?.userId ?? null
}
