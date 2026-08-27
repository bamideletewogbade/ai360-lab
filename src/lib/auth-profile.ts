type UserMetadataSource = { user_metadata?: Record<string, unknown> | null }

export function authMetadata(user: UserMetadataSource, key: string) {
  const value = user.user_metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function authDisplayName(user: UserMetadataSource) {
  return authMetadata(user, 'full_name')
    || authMetadata(user, 'name')
    || [authMetadata(user, 'first_name'), authMetadata(user, 'last_name')].filter(Boolean).join(' ')
    || null
}

export function authImageUrl(user: UserMetadataSource) {
  return authMetadata(user, 'avatar_url') || authMetadata(user, 'picture')
}
