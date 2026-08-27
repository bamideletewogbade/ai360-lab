import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'
import { resolveCallbackOrigin, safeInternalPath } from '@/lib/auth-callback'
import { authDisplayName, authImageUrl } from '@/lib/auth-profile'
import { claimInvitationOnSignIn } from '@/lib/admin/invitation-claim'

export const dynamic = 'force-dynamic'

/**
 * The email-link kinds this callback will verify.
 *
 * An allowlist rather than a cast: `type` arrives in a URL anyone can edit, and
 * handing an arbitrary string to `verifyOtp` would let a caller name a flow the
 * app never issues.
 */
const EMAIL_OTP_TYPES = ['invite', 'magiclink', 'recovery', 'signup', 'email', 'email_change'] as const
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number]

function emailOtpType(value: string | null): EmailOtpType | null {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType) ? value as EmailOtpType : null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const next = safeInternalPath(url.searchParams.get('next'))
  const origin = resolveCallbackOrigin({
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    configuredAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    requestUrl: request.url,
  })
  const redirectUrl = new URL(next, origin)

  if (!isSupabaseAuthConfigured()) {
    redirectUrl.searchParams.set('auth_error', 'not_configured')
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = await createSupabaseServerClient()

  // Two ways in, because two different things send people here.
  //
  //   code       — an OAuth round trip the browser itself started, so a PKCE
  //                verifier exists to exchange against.
  //   token_hash — an email link minted server-side (invitation, recovery).
  //                There is no verifier for these, which is why reading only
  //                `code` left an invited participant signed out: the branch
  //                below never ran and the request fell straight through to
  //                `callback_failed`.
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const otpType = emailOtpType(url.searchParams.get('type'))

  const authenticated = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && otpType
      ? await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash })
      : null

  if (authenticated && !authenticated.error) {
    // An invited participant arrives here through their invitation link, so
    // this is the first and only moment the pending invitation can be turned
    // into a membership. It never throws and never blocks the redirect.
    const user = authenticated.data?.user
    if (user?.id) {
      await claimInvitationOnSignIn({
        userId: user.id,
        email: user.email ?? null,
        displayName: authDisplayName(user),
        imageUrl: authImageUrl(user),
      })
    }
    return NextResponse.redirect(redirectUrl)
  }

  redirectUrl.searchParams.set('auth_error', 'callback_failed')
  return NextResponse.redirect(redirectUrl)
}
