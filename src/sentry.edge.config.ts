import * as Sentry from '@sentry/nextjs'
import { redactSentryEvent } from './lib/sentry-redact'

const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined

// Edge-runtime Sentry (proxy/middleware, edge routes): same env-driven DSN,
// redaction and privacy posture as the Node config. Loaded from
// instrumentation.ts when NEXT_RUNTIME is 'edge'.
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.AI360_DEPLOYMENT_ENV?.trim()
      || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    release: process.env.HOSTINGER_GIT_COMMIT_SHA?.trim()
      || process.env.GIT_COMMIT_SHA?.trim()
      || process.env.AI360_DEPLOYMENT_ID_OVERRIDE?.trim()
      || process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    sendDefaultPii: false,
    dataCollection: { userInfo: false, httpBodies: [] },
    beforeSend: (event) => redactSentryEvent(event) as typeof event | null,
  })
}
