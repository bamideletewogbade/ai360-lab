import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const freshAppShell = {
  key: 'Cache-Control',
  value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      {
        // Hostinger's CDN otherwise keeps the statically generated app shell
        // after a Git deployment, leaving learners on an older interface.
        source: '/',
        headers: [...securityHeaders, freshAppShell],
      },
      {
        // Pricing is a commercial contract surface. Do not let the CDN serve a
        // catalog from an earlier deployment after the source of truth changes.
        source: '/pricing',
        headers: [...securityHeaders, freshAppShell],
      },
      { source: '/(.*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
