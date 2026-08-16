import type { Event } from "@sentry/nextjs";

/**
 * Privacy filter applied to every Sentry event before it leaves the server or
 * the browser.
 *
 * AI360's logging rules are absolute: prompts, file contents, payment
 * credentials, authorization headers and generated media never leave the app.
 * Sentry events are rich (breadcrumbs, request details, extra data), so this
 * filter scrubs known secret shapes from every string and drops whole fields
 * whose names can carry private content. It mirrors the redaction in
 * `observability.ts` so the console, Axiom and Sentry all see the same shape.
 */

const SECRET_SHAPE =
  /\b(?:sk-or-v1-|sk-|sntrys_|sb_secret_)[A-Za-z0-9_-]{8,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~-]+\b/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// Fields that can carry private content and are never useful for triage.
const PRIVATE_FIELD =
  /^(?:prompt|content|text|body|data|authorization|cookie|set-cookie|token|api[_-]?key|secret|password|pin|otp|card|phone|payment|reference|transaction|transactions|probe)$/i;

function scrub(value: string) {
  return value
    .replace(SECRET_SHAPE, "[redacted-key]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(EMAIL, "[redacted-email]")
    .slice(0, 4_000);
}

function cleanValue(value: unknown, key: string, depth: number): unknown {
  if (depth > 4) return "[deep]";
  if (typeof value === "string")
    return PRIVATE_FIELD.test(key) ? "[redacted]" : scrub(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => cleanValue(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([childKey]) => !PRIVATE_FIELD.test(childKey))
        .map(([childKey, child]) => [
          childKey,
          cleanValue(child, childKey, depth + 1),
        ]),
    );
  }
  return scrub(String(value));
}

export function redactSentryEvent(event: Event): Event {
  if (typeof event.message === "string") event.message = scrub(event.message);
  if (event.extra)
    event.extra = cleanValue(event.extra, "extra", 0) as Record<
      string,
      unknown
    >;
  if (event.request?.data !== undefined) event.request.data = "[redacted]";
  if (event.request?.headers) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.request.headers)) {
      headers[key] = PRIVATE_FIELD.test(key) ? "[redacted]" : value;
    }
    event.request.headers = headers;
  }
  if (Array.isArray(event.breadcrumbs))
    event.breadcrumbs = event.breadcrumbs.slice(-20);
  if (event.tags) {
    const tags: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.tags)) {
      tags[key] = typeof value === "string" ? scrub(value) : value;
    }
    event.tags = tags as typeof event.tags;
  }
  return event;
}
