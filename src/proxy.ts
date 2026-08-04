import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
)

const configuredParties = (process.env.CLERK_AUTHORIZED_PARTIES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const authorizedParties = configuredParties.length
  ? configuredParties
  : process.env.NODE_ENV === 'production'
    ? ['https://aithreesixty.tech', 'https://lab.aithreesixty.tech']
    : ['http://localhost:3000']

const handleClerk = clerkMiddleware({
  authorizedParties,
  contentSecurityPolicy: {
    directives: {
      'img-src': ['data:', 'blob:'],
      'media-src': ["'self'", 'data:', 'blob:'],
    },
  },
})

const fallbackContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
].join('; ')

export default authConfigured
  ? handleClerk
  : function proxyWithoutAuth() {
      const response = NextResponse.next()
      response.headers.set('Content-Security-Policy', fallbackContentSecurityPolicy)
      return response
    }

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
