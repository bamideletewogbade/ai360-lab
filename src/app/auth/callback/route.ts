import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'
import { resolveCallbackOrigin, safeInternalPath } from '@/lib/auth-callback'
import { authDisplayName, authImageUrl } from '@/lib/auth-profile'
import { claimInvitationOnSignIn } from '@/lib/admin/invitation-claim'

export const dynamic = 'force-dynamic'

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

  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // An invited participant arrives here through their invitation link, so
      // this is the first and only moment the pending invitation can be turned
      // into a membership. It never throws and never blocks the redirect.
      if (data?.user?.id) {
        await claimInvitationOnSignIn({
          userId: data.user.id,
          email: data.user.email ?? null,
          displayName: authDisplayName(data.user),
          imageUrl: authImageUrl(data.user),
        })
      }
      return NextResponse.redirect(redirectUrl)
    }
  }

  redirectUrl.searchParams.set('auth_error', 'callback_failed')
  return NextResponse.redirect(redirectUrl)
}
