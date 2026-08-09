import type { Instrumentation } from 'next'

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}\b/gi, '[redacted-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .slice(0, 500)
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const event = {
    timestamp: new Date().toISOString(),
    service: 'ai360-lab',
    release: process.env.HOSTINGER_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    event: 'server.request_error',
    errorName: error instanceof Error ? error.name.slice(0, 120) : 'UnknownError',
    errorMessage: safeError(error),
    digest: typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest).slice(0, 160) : undefined,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  }
  console.error(JSON.stringify(event))

  const destination = process.env.AI360_ERROR_ALERT_WEBHOOK_URL?.trim()
  if (!destination) return
  try {
    const response = await fetch(destination, {
      method: 'POST',
      signal: AbortSignal.timeout(3_000),
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI360_ERROR_ALERT_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.AI360_ERROR_ALERT_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(event),
    })
    if (!response.ok) console.error(JSON.stringify({ ...event, event: 'server.error_alert_failed', providerStatus: response.status }))
  } catch {
    console.error(JSON.stringify({ ...event, event: 'server.error_alert_failed' }))
  }
}
