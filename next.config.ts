import type { NextConfig } from 'next'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// The build wrapper persists one release ID so `next build` and `next start`
// always agree without requiring a manual Hostinger environment change.
const deploymentId = (() => {
  if (process.env.NODE_ENV !== 'production') return undefined
  try {
    return readFileSync(resolve(process.cwd(), '.deployment-id'), 'utf8').trim() || undefined
  } catch {
    return process.env.NEXT_DEPLOYMENT_ID?.trim() || undefined
  }
})()

const nextConfig: NextConfig = {
  ...(deploymentId ? { deploymentId } : {}),
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      {
        source: '/',
        headers: [...securityHeaders, freshAppShell],
      },
      { source: '/pricing', headers: [...securityHeaders, freshAppShell] },
      {
        // The private workspace shell must never outlive the chunk set deployed
        // beside it. API and hashed asset caching remain untouched.
        source: '/app/:path*',
        headers: [...securityHeaders, freshAppShell],
      },
      { source: '/(.*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
