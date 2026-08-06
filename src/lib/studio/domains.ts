/**
 * Domain availability, answered honestly.
 *
 * Two sources, neither sufficient alone. Verified live on 2026-08-05:
 *
 * RDAP is the registry protocol that replaced WHOIS. Where a registry publishes
 * it, a 404 genuinely means unregistered. But `.gh` publishes none, and rdap.org
 * returns 404 for every `.gh` name, so trusting it would have told a Ghanaian
 * business that `mtn.com.gh` was free.
 *
 * DNS is the other direction. A name with nameservers is definitely registered,
 * which correctly catches `mtn.com.gh`. The reverse does not hold: `ecobank.com.gh`
 * has no NS record and is certainly not available.
 *
 * So the honest verdicts are taken, available, and unknown. For `.gh` we can only
 * ever say taken or unknown, and saying so is better than guessing.
 */

export type DomainVerdict = 'available' | 'taken' | 'unknown'

export type DomainResult = {
  domain: string
  verdict: DomainVerdict
  /** Why we believe it, in words a non-technical person can act on. */
  reason: string
  registrar?: string
}

/**
 * Suffixes whose registries publish RDAP, so a "no record" answer can be
 * trusted. Anything absent from this list can only ever be reported as taken or
 * unknown. Add a suffix only after checking a known-registered name under it.
 */
const RDAP_AUTHORITATIVE = new Set([
  'com', 'net', 'org', 'info', 'biz', 'io', 'co', 'me', 'tech', 'shop', 'store',
  'app', 'dev', 'online', 'site', 'xyz', 'africa', 'ng', 'ke',
])

/** Ghanaian suffixes, kept explicit because they are the ones that matter here. */
const GHANA_SUFFIXES = ['com.gh', 'org.gh', 'edu.gh', 'gov.gh', 'net.gh', 'gh']

export function domainSuffix(domain: string) {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  for (const suffix of GHANA_SUFFIXES) {
    if (clean.endsWith(`.${suffix}`)) return suffix
  }
  const parts = clean.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export function isRdapAuthoritative(domain: string) {
  return RDAP_AUTHORITATIVE.has(domainSuffix(domain))
}

/** Rejects anything that is not a plausible hostname before we go to the network. */
export function normalizeDomain(value: string) {
  const clean = value.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '')
  if (!clean.includes('.') || clean.length > 253) return null
  if (clean.startsWith('.') || clean.endsWith('.') || clean.includes('..')) return null
  if (!/^[a-z0-9]/.test(clean)) return null
  return clean
}

type Fetcher = typeof fetch

/** A name with nameservers is registered. Silence proves nothing. */
async function hasNameservers(domain: string, doFetch: Fetcher): Promise<boolean | null> {
  try {
    const res = await doFetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const body = await res.json() as { Status?: number; Answer?: unknown[] }
    if (Array.isArray(body.Answer) && body.Answer.length > 0) return true
    if (body.Status === 3) return false
    return null
  } catch {
    return null
  }
}

async function rdapLookup(domain: string, doFetch: Fetcher): Promise<{ registered: boolean; registrar?: string } | null> {
  try {
    const res = await doFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return { registered: false }
    if (!res.ok) return null
    const body = await res.json() as {
      entities?: Array<{ roles?: string[]; vcardArray?: unknown[] }>
    }
    const registrar = body.entities?.find((entity) => entity.roles?.includes('registrar'))
    const card = Array.isArray(registrar?.vcardArray?.[1]) ? registrar.vcardArray[1] as unknown[][] : []
    const name = card.find((field) => field[0] === 'fn')?.[3]
    return { registered: true, registrar: typeof name === 'string' ? name : undefined }
  } catch {
    return null
  }
}

export async function checkDomain(input: string, doFetch: Fetcher = fetch): Promise<DomainResult | null> {
  const domain = normalizeDomain(input)
  if (!domain) return null

  // Registration is checked first, because it is the only answer that is
  // certain regardless of which suffix the name is under.
  const registered = await hasNameservers(domain, doFetch)
  if (registered === true) {
    return { domain, verdict: 'taken', reason: 'This name is already in use. It has live nameservers.' }
  }

  if (isRdapAuthoritative(domain)) {
    const rdap = await rdapLookup(domain, doFetch)
    if (rdap?.registered === false) {
      return { domain, verdict: 'available', reason: 'No registration record exists for this name.' }
    }
    if (rdap?.registered) {
      return {
        domain,
        verdict: 'taken',
        reason: 'This name is already registered.',
        registrar: rdap.registrar,
      }
    }
    return { domain, verdict: 'unknown', reason: 'The registry did not answer. Try again shortly.' }
  }

  // No registry we can trust for this suffix, which is the case for .gh.
  return {
    domain,
    verdict: 'unknown',
    reason: `No public registry lookup exists for .${domainSuffix(domain)} names. Confirm this one with the registrar before you rely on it.`,
  }
}

/** Checks a shortlist at once. Order is preserved so results line up with names. */
export async function checkDomains(names: string[], doFetch: Fetcher = fetch) {
  const unique = [...new Set(names.map((name) => normalizeDomain(name)).filter((name): name is string => Boolean(name)))]
  const results = await Promise.all(unique.slice(0, 24).map((name) => checkDomain(name, doFetch)))
  return results.filter((result): result is DomainResult => result !== null)
}
