import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Bridges structured error-level logs into Sentry.
 *
 * Route handlers catch their own failures and return 5xx, so Next's
 * `onRequestError` hook (unhandled errors only) would never see a provider
 * failure or a settlement mismatch. This turns every `log.error(...)` into a
 * Sentry issue carrying the same requestId, route and event name used in the
 * console and Axiom lines — one trace across all three destinations.
 *
 * Redaction is applied twice: the fields were already scrubbed by
 * `observability.ts`'s `safeValue`, and Sentry's `beforeSend` (see
 * `sentry-redact.ts`) scrubs the event again.
 */
export function reportErrorEvent(input: {
  event: string;
  message?: string;
  requestId?: string;
  route?: string;
  extra?: Record<string, unknown>;
}) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.captureMessage(input.message || input.event, {
    level: "error",
    tags: {
      event: input.event.slice(0, 80),
      ...(input.route ? { route: input.route.slice(0, 120) } : {}),
    },
    extra: {
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...input.extra,
    },
  });
}
