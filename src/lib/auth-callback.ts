/**
 * Where the sign-in callback sends someone once their session exists.
 *
 * Kept pure and free of framework types so the rules can be unit tested. The
 * rules exist because `request.url` describes the address the server listens
 * on, not the address the browser used: behind a proxy, or on a dev server
 * bound to every interface, trusting it strands people on an unreachable host.
 */

export function isLocalHost(host: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host.trim())
}

/** Proxies may append values; the first entry is the original client-facing one. */
function firstHeaderValue(value: string | null | undefined) {
  const first = value?.split(',')[0]?.trim()
  return first || null
}

export function resolveCallbackOrigin(input: {
  forwardedHost?: string | null
  host?: string | null
  forwardedProto?: string | null
  configuredAppUrl?: string | null
  requestUrl: string
}): string {
  const host = firstHeaderValue(input.forwardedHost) || firstHeaderValue(input.host)

  // Local development keeps using whatever host the browser actually used, so
  // http://localhost:3000 and http://127.0.0.1:3000 both work without config.
  if (host && isLocalHost(host)) {
    const proto = firstHeaderValue(input.forwardedProto) || 'http'
    return `${proto}://${host}`
  }

  // Everywhere else the canonical URL wins. Taking the public origin from
  // configuration rather than a request header keeps a forged `Host` from
  // turning the callback into an open redirect.
  const configured = input.configuredAppUrl?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // Malformed configuration falls through to the request-derived origin.
    }
  }

  if (host && !host.startsWith('0.0.0.0')) return `https://${host}`

  try {
    const reqOrigin = new URL(input.requestUrl).origin
    if (!reqOrigin.includes('0.0.0.0')) return reqOrigin
  } catch {
    // malformed requestUrl falls through
  }

  return 'http://localhost:3000'
}
