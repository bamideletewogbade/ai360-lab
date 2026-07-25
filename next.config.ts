import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'" },
]

const freshAppShell = {
  key: 'Cache-Control',
  value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Hostinger's CDN otherwise keeps the statically generated app shell
        // after a Git deployment, leaving learners on an older interface.
        source: '/',
        headers: [...securityHeaders, freshAppShell],
      },
      { source: '/(.*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
