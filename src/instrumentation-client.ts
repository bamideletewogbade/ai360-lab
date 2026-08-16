import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./lib/sentry-redact";

// Browser error + performance monitoring, initialized before hydration via
// Next.js 16 client instrumentation.
//
// Session replay is deliberately OFF: prompts, files and screens could appear
// in a replay, which violates the privacy rules. Instead we capture errors
// plus page-load / navigation traces at a low sample rate — small payloads
// matter on the mobile networks most users are on.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    sendDefaultPii: false,
    // Never send user identity or request/response bodies to Sentry.
    dataCollection: { userInfo: false, httpBodies: [] },
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend: (event) => redactSentryEvent(event) as typeof event | null,
  });
}

// Instrument App Router navigations into Sentry traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
