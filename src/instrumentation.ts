import * as Sentry from "@sentry/nextjs";

// Next.js 16 server instrumentation: run once at server start, and hand every
// unhandled server error (route handler, rendering, server action) to Sentry
// with request and route context via the framework's onRequestError hook.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
