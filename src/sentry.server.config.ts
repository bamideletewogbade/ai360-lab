import * as Sentry from '@sentry/nextjs'
import { redactSentryEvent } from './lib/sentry-redact'

const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined

// Server-side Sentry: unhandled route/rendering errors (via Next's
// onRequestError hook in instrumentation.ts) plus error-level structured
// events bridged from observability.ts. The DSN is optional — without it,
// nothing is sent and the app behaves exactly as before.
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.AI360_DEPLOYMENT_ENV?.trim()
      || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    // Same release identity the rest of the app logs, so a Sentry issue maps
    // to the deployment that introduced it.
    release: process.env.HOSTINGER_GIT_COMMIT_SHA?.trim()
      || process.env.GIT_COMMIT_SHA?.trim()
      || process.env.AI360_DEPLOYMENT_ID_OVERRIDE?.trim()
      || process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    // Structured warn/error log lines from observability.ts land in Sentry
    // Logs (Sentry.logger). Info-level lines stay in Axiom/console to keep
    // log volume and cost predictable.
    enableLogs: true,
    sendDefaultPii: false,
    // Never send user identity or request/response bodies to Sentry.
    dataCollection: { userInfo: false, httpBodies: [] },
    beforeSend: (event) => redactSentryEvent(event) as typeof event | null,
  })
}
