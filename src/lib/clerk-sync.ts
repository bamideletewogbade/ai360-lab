type ClerkEmail = { id?: string; email_address?: string }

export type ClerkUserPayload = {
  id?: string | null
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmail[]
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
}

export function clerkUserProfile(data: ClerkUserPayload) {
  const primary = data.email_addresses?.find((email) => email.id === data.primary_email_address_id)
  const email = primary?.email_address || data.email_addresses?.[0]?.email_address || null
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null
  return {
    id: typeof data.id === 'string' ? data.id : null,
    email,
    displayName: name,
    imageUrl: data.image_url || null,
  }
}

export function webhookEventId(value: string | null) {
  const cleaned = value?.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 160)
  return cleaned || null
}
