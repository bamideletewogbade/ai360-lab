/**
 * Deciding when two addresses are the same mailbox.
 *
 * An invitation is claimed by matching the address it was sent to against the
 * address the person signs in with. Those differ more often than they should:
 * somebody invited at `ada+pilot@gmail.com` taps "Continue with Google" and the
 * provider returns `ada@gmail.com`, so the exact-match lookup finds nothing.
 * The account is created, no credits are granted, no membership exists, and the
 * console shows the invitation as `sent` forever with no error anywhere. The
 * person's first experience of AI360 is an empty account.
 *
 * The rule here is deliberately narrow: normalise ONLY what the mail provider
 * itself guarantees routes to one inbox. A claim moves credits, so a false
 * match spends somebody else's allowance — that is a worse failure than the one
 * being fixed, and it is silent too.
 *
 * What is NOT attempted: matching across different mailboxes. If somebody is
 * invited at `x@yahoo.com` and signs in as `y@gmail.com`, no amount of string
 * comparison can prove those are the same person. That case is detected from
 * the funnel instead — see `readInvitationMismatches` — and handed to an
 * operator rather than guessed at.
 */

/**
 * Google ignores dots in the local part and everything after a `+`, and treats
 * googlemail.com as an alias of gmail.com. This is documented, deterministic
 * behaviour, not an inference.
 */
const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * Providers that document `+` sub-addressing. Dots stay significant everywhere
 * except Google — `john.doe@outlook.com` and `johndoe@outlook.com` are two
 * different people.
 */
const PLUS_ADDRESSING_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'fastmail.com', 'zoho.com',
])

function split(address: string) {
  const trimmed = address.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!local || !domain || !domain.includes('.')) return null
  // A quoted local part may legitimately contain dots and plus signs that are
  // not sub-addressing. Leave it exactly as written.
  if (local.startsWith('"')) return { local, domain, quoted: true }
  return { local, domain, quoted: false }
}

/**
 * The address reduced to the mailbox it provably reaches, or null when the
 * input is not an address. Two addresses with the same canonical form are the
 * same inbox; two with different forms may still be, and are not assumed to be.
 */
export function canonicalEmail(address: unknown): string | null {
  if (typeof address !== 'string') return null
  const parts = split(address)
  if (!parts) return null
  if (parts.quoted) return `${parts.local}@${parts.domain}`

  const domain = GOOGLE_DOMAINS.has(parts.domain) ? 'gmail.com' : parts.domain
  let local = parts.local

  if (PLUS_ADDRESSING_DOMAINS.has(parts.domain)) {
    const plus = local.indexOf('+')
    if (plus === 0) return null // nothing but a tag is not an address
    if (plus > 0) local = local.slice(0, plus)
  }

  if (GOOGLE_DOMAINS.has(parts.domain)) {
    local = local.replaceAll('.', '')
  }

  return local ? `${local}@${domain}` : null
}

/** True when both addresses provably reach one inbox. */
export function isSameMailbox(left: unknown, right: unknown) {
  const a = canonicalEmail(left)
  const b = canonicalEmail(right)
  return Boolean(a && b && a === b)
}

/**
 * The domains an invitation could carry and still be the same mailbox as this
 * address. Used to bound the candidate lookup at claim time, so the fallback
 * stays one small indexed read rather than a scan of every open invitation.
 */
export function candidateDomains(address: unknown): string[] {
  const parts = typeof address === 'string' ? split(address) : null
  if (!parts) return []
  return GOOGLE_DOMAINS.has(parts.domain) ? [...GOOGLE_DOMAINS] : [parts.domain]
}

/**
 * Picks the one invitation that belongs to this person, from the candidates a
 * domain-scoped query returned.
 *
 * Returns `ambiguous` rather than a guess when more than one open invitation
 * canonicalises to the same inbox — that means an operator imported both
 * `ada@gmail.com` and `ada+pilot@gmail.com`, and choosing between them would be
 * arbitrary. It is rare, and an operator resolving it by hand is correct.
 */
export function resolveInvitationForEmail<T extends { email: string }>(
  signedInEmail: string,
  candidates: T[],
): { match: T } | { match: null; reason: 'none' | 'ambiguous' } {
  const canonical = canonicalEmail(signedInEmail)
  if (!canonical) return { match: null, reason: 'none' }

  const exact = candidates.find((row) => row.email.trim().toLowerCase() === signedInEmail.trim().toLowerCase())
  if (exact) return { match: exact }

  const sameMailbox = candidates.filter((row) => canonicalEmail(row.email) === canonical)
  if (sameMailbox.length === 1) return { match: sameMailbox[0] }
  if (sameMailbox.length > 1) return { match: null, reason: 'ambiguous' }
  return { match: null, reason: 'none' }
}
