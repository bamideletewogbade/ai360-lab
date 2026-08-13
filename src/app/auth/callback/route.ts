import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

function safeNext(value: string | null) {
  if (value?.startsWith('/') && !value.startsWith('//')) return value
  return '/app'
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get('next'))
  const redirectUrl = new URL(next, url.origin)

  if (!isSupabaseAuthConfigured()) {
    redirectUrl.searchParams.set('auth_error', 'not_configured')
    return NextResponse.redirect(redirectUrl)
  }

  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(redirectUrl)
  }

  redirectUrl.searchParams.set('auth_error', 'callback_failed')
  return NextResponse.redirect(redirectUrl)
}
