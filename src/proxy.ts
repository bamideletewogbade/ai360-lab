import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseProjectOrigin, supabasePublicConfig } from '@/lib/supabase/config'

function contentSecurityPolicy() {
  const supabaseOrigin = supabaseProjectOrigin()
  const connectSrc = ["'self'"]
  if (supabaseOrigin) {
    connectSrc.push(supabaseOrigin)
    try {
      const host = new URL(supabaseOrigin).host
      connectSrc.push(`wss://${host}`)
    } catch { /* ignored; the HTTP origin is still useful when valid */ }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
  ].join('; ')
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('Content-Security-Policy', contentSecurityPolicy())
  return response
}

export default async function proxy(request: NextRequest) {
  const config = supabasePublicConfig()
  let response = NextResponse.next({ request })

  if (!config) return applySecurityHeaders(response)

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        response = NextResponse.next({ request })

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value)
        }
      },
    },
  })

  await supabase.auth.getClaims().catch(() => undefined)

  return applySecurityHeaders(response)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
