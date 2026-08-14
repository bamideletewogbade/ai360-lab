import type { User } from '@supabase/supabase-js'

export function authMetadata(user: User, key: string) {
  const value = (user.user_metadata as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function authDisplayName(user: User) {
  return authMetadata(user, 'full_name')
    || authMetadata(user, 'name')
    || [authMetadata(user, 'first_name'), authMetadata(user, 'last_name')].filter(Boolean).join(' ')
    || null
}

export function authImageUrl(user: User) {
  return authMetadata(user, 'avatar_url') || authMetadata(user, 'picture')
}
