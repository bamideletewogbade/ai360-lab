type LogLevel = 'info' | 'warn' | 'error'

type LogFields = Record<string, unknown>

const SERVICE = 'ai360-lab'
const RELEASE =
  process.env.HOSTINGER_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.npm_package_version ||
  'unknown'

function redact(value: string) {
  return value
    .replace(/\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}\b/gi, '[redacted-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .slice(0, 500)
}

function safeValue(value: unknown): unknown {
  if (typeof value === 'undefined') return undefined
  if (typeof value === 'string') return redact(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^(authorization|api[-_]?key|cookie|prompt|content|data|text)$/i.test(key))
        .slice(0, 30)
        .map(([key, item]) => [key, safeValue(item)]),
    )
  }
  return String(value)
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    release: RELEASE,
    event,
    ...safeValue(fields) as LogFields,
  })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.info(entry)
}

/**
 * Emit a structured, redacted log line outside a request context — background
 * work such as email delivery or a scheduled sweep, where there is no
 * `requestLogger` to hang the event on.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  write(level, event, fields)
}

export function errorDetails(error: unknown) {
  if (error instanceof Error) {
    const cause =
      error.cause && typeof error.cause === 'object'
        ? error.cause as { code?: unknown; name?: unknown; message?: unknown }
        : undefined
    return {
      errorName: error.name,
      errorMessage: redact(error.message),
      ...(error.stack ? { errorStack: redact(error.stack) } : {}),
      ...(cause?.code ? { causeCode: String(cause.code).slice(0, 80) } : {}),
      ...(cause?.name ? { causeName: String(cause.name).slice(0, 80) } : {}),
      ...(cause?.message ? { causeMessage: redact(String(cause.message)) } : {}),
    }
  }
  return { errorMessage: redact(String(error)) }
}

export async function providerErrorDetails(response: Response) {
  const raw = await response.text().catch(() => '')
  let code = ''
  let message = ''
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: unknown; type?: unknown; message?: unknown }
      message?: unknown
    }
    code = String(parsed.error?.code || parsed.error?.type || '').slice(0, 100)
    message = redact(String(parsed.error?.message || parsed.message || ''))
  } catch {
    message = redact(raw)
  }
  return {
    providerStatus: response.status,
    providerStatusText: response.statusText,
    providerRequestId:
      response.headers.get('x-request-id') ||
      response.headers.get('x-openrouter-request-id') ||
      undefined,
    ...(code ? { providerCode: code } : {}),
    ...(message ? { providerMessage: message } : {}),
  }
}

function cleanRequestId(value: string | null) {
  const cleaned = value?.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)
  return cleaned || crypto.randomUUID()
}

export function requestLogger(request: Request, route: string) {
  const requestId = cleanRequestId(request.headers.get('x-request-id'))
  const startedAt = performance.now()
  const base = {
    requestId,
    route,
    method: request.method,
  }

  write('info', 'request.started', {
    ...base,
    contentLength: Number(request.headers.get('content-length')) || undefined,
    host: request.headers.get('host') || undefined,
  })

  return {
    requestId,
    info(event: string, fields: LogFields = {}) {
      write('info', event, { ...base, ...fields })
    },
    warn(event: string, fields: LogFields = {}) {
      write('warn', event, { ...base, ...fields })
    },
    error(event: string, fields: LogFields = {}) {
      write('error', event, { ...base, ...fields })
    },
    finish(status: number, fields: LogFields = {}) {
      write(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'request.completed', {
        ...base,
        status,
        durationMs: Math.round(performance.now() - startedAt),
        ...fields,
      })
    },
    headers(extra: HeadersInit = {}) {
      return {
        ...Object.fromEntries(new Headers(extra).entries()),
        'X-Request-Id': requestId,
      }
    },
  }
}
