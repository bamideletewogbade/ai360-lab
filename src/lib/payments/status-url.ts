import { resolveCallbackOrigin } from '@/lib/auth-callback'

/**
 * Where a verified ExpressPay return sends the customer's browser.
 *
 * The return route redirects to `/payment/status`. That target must be built
 * from the public origin, never from `request.url`: behind a proxy, or on a
 * server bound to every interface, `request.url` reports the address the
 * server listens on (`0.0.0.0:3000`), which no browser can reach. The same
 * rule that protects the sign-in callback applies here, so the origin is
 * resolved with `resolveCallbackOrigin`: the configured public URL wins, then
 * proxy headers, and bind-all addresses are never trusted.
 *
 * Kept pure and free of framework types so the redirect rules can be unit
 * tested without importing Next.js.
 */
export function paymentStatusUrl(input: {
  forwardedHost?: string | null
  host?: string | null
  forwardedProto?: string | null
  configuredAppUrl?: string | null
  requestUrl: string
  orderId?: string
  check?: string
}): URL {
  const origin = resolveCallbackOrigin(input)
  const url = new URL('/payment/status', origin)
  if (input.orderId) url.searchParams.set('order', input.orderId)
  if (input.check) url.searchParams.set('check', input.check)
  return url
}
