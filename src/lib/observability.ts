import * as Sentry from "@sentry/nextjs";
import { logSinkSend } from "./log-sink";
import { reportErrorEvent } from "./error-tracking";

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const SERVICE = "ai360-lab";
const RELEASE =
  process.env.HOSTINGER_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.npm_package_version ||
  "unknown";

function redact(value: string) {
  return value
    .replace(/\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}\b/gi, "[redacted-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .slice(0, 500);
}

function safeValue(value: unknown): unknown {
  if (typeof value === "undefined") return undefined;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(authorization|api[-_]?key|cookie|prompt|content|data|text)$/i.test(
              key,
            ),
        )
        .slice(0, 30)
        .map(([key, item]) => [key, safeValue(item)]),
    );
  }
  return String(value);
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const scrubbed = safeValue(fields) as LogFields;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    release: RELEASE,
    event,
    ...scrubbed,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
  // Second destination: Axiom (search, retention, alerts). Fire-and-forget;
  // console output stays the source of truth.
  logSinkSend(entry);
  // Third destination: Sentry Logs. warn/error lines become searchable logs
  // in Sentry carrying the same requestId/route/event shape as the console
  // and Axiom copies. Info lines stay in Axiom/console to keep log volume
  // and cost predictable. No-op unless a DSN is configured.
  sentryLogSend(level, event, scrubbed);
}

// Sentry's structured-log API. Redaction happens upstream in `safeValue`, and
// the Sentry client is only initialized when a DSN exists, so this is a no-op
// in every other environment.
function sentryLogSend(level: LogLevel, event: string, fields: LogFields) {
  if (level === "info") return;
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const attributes = { ...fields } as Record<string, unknown>;
  if (level === "error") Sentry.logger.error(event, attributes);
  else Sentry.logger.warn(event, attributes);
}

/**
 * Emit a structured, redacted log line outside a request context — background
 * work such as email delivery or a scheduled sweep, where there is no
 * `requestLogger` to hang the event on. Error-level events also become Sentry
 * issues so handled failures are traceable.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
) {
  write(level, event, fields);
  if (level === "error") {
    reportErrorEvent({
      event,
      requestId:
        typeof fields.requestId === "string" ? fields.requestId : undefined,
      extra: fields,
    });
  }
}

export function errorDetails(error: unknown) {
  if (error instanceof Error) {
    const cause =
      error.cause && typeof error.cause === "object"
        ? (error.cause as { code?: unknown; name?: unknown; message?: unknown })
        : undefined;
    return {
      errorName: error.name,
      errorMessage: redact(error.message),
      ...(error.stack ? { errorStack: redact(error.stack) } : {}),
      ...(cause?.code ? { causeCode: String(cause.code).slice(0, 80) } : {}),
      ...(cause?.name ? { causeName: String(cause.name).slice(0, 80) } : {}),
      ...(cause?.message
        ? { causeMessage: redact(String(cause.message)) }
        : {}),
    };
  }
  return { errorMessage: redact(String(error)) };
}

export async function providerErrorDetails(response: Response) {
  const raw = await response.text().catch(() => "");
  let code = "";
  let message = "";
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: unknown; type?: unknown; message?: unknown };
      message?: unknown;
    };
    code = String(parsed.error?.code || parsed.error?.type || "").slice(0, 100);
    message = redact(String(parsed.error?.message || parsed.message || ""));
  } catch {
    message = redact(raw);
  }
  return {
    providerStatus: response.status,
    providerStatusText: response.statusText,
    providerRequestId:
      response.headers.get("x-request-id") ||
      response.headers.get("x-openrouter-request-id") ||
      undefined,
    ...(code ? { providerCode: code } : {}),
    ...(message ? { providerMessage: message } : {}),
  };
}

function cleanRequestId(value: string | null) {
  const cleaned = value?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return cleaned || crypto.randomUUID();
}

export function requestLogger(request: Request, route: string) {
  const requestId = cleanRequestId(request.headers.get("x-request-id"));
  const startedAt = performance.now();
  const base = {
    requestId,
    route,
    method: request.method,
  };

  write("info", "request.started", {
    ...base,
    contentLength: Number(request.headers.get("content-length")) || undefined,
    host: request.headers.get("host") || undefined,
  });

  return {
    requestId,
    info(event: string, fields: LogFields = {}) {
      write("info", event, { ...base, ...fields });
    },
    warn(event: string, fields: LogFields = {}) {
      write("warn", event, { ...base, ...fields });
    },
    error(event: string, fields: LogFields = {}) {
      write("error", event, { ...base, ...fields });
      // Handled failures are invisible to the framework's onRequestError hook,
      // so bridge them explicitly: same requestId, route and event name as the
      // console/Axiom lines.
      reportErrorEvent({ event, requestId, route: base.route, extra: fields });
    },
    finish(status: number, fields: LogFields = {}) {
      write(
        status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        "request.completed",
        {
          ...base,
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...fields,
        },
      );
    },
    headers(extra: HeadersInit = {}) {
      return {
        ...Object.fromEntries(new Headers(extra).entries()),
        "X-Request-Id": requestId,
      };
    },
  };
}
