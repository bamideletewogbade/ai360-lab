import assert from "node:assert/strict";
import test from "node:test";
import { redactSentryEvent } from "../src/lib/sentry-redact.ts";
import type { Event } from "@sentry/nextjs";

function event(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "evt_test",
    timestamp: "2026-08-16T00:00:00.000Z",
    platform: "node",
    level: "error",
    ...overrides,
  } as Event;
}

test("scrubs secret-shaped strings and drops private fields from Sentry events", () => {
  const result = redactSentryEvent(
    event({
      message:
        "provider failed sk-or-v1-abcdefghijklmnopqrstuvwxyz Bearer abc.def.ghi contact ama@example.com",
      extra: {
        requestId: "req_123",
        route: "/api/studio/video",
        status: 502,
        prompt: "A drone shot over Accra",
        content: "top secret brief",
        providerMessage: "rate limit hit",
        errorStack: "Error: boom sk-or-v1-zzzzzzzzzzzzzzzzzzzzzzzz",
      },
      request: {
        url: "https://ai360.africa/api/studio/video",
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
          host: "ai360.africa",
        },
        data: { prompt: "hello" },
      },
      tags: { event: "studio.video.failed", release: "abc123" },
    }),
  );

  // Private fields are dropped entirely; triage fields survive.
  assert.equal(result.extra?.prompt, undefined);
  assert.equal(result.extra?.content, undefined);
  assert.equal(result.extra?.requestId, "req_123");
  assert.equal(result.extra?.route, "/api/studio/video");
  assert.equal(result.extra?.status, 502);

  // Secret shapes are scrubbed wherever they appear.
  assert.match(String(result.extra?.providerMessage), /rate limit/);
  assert.doesNotMatch(String(result.extra?.errorStack), /sk-or-v1-/);
  assert.match(String(result.extra?.errorStack), /\[redacted-key\]/);
  assert.doesNotMatch(result.message || "", /ama@example\.com/);
  assert.match(result.message || "", /\[redacted-email\]/);

  // Request headers and bodies never leave with their content.
  assert.equal(result.request?.data, "[redacted]");
  assert.equal(result.request?.headers?.authorization, "[redacted]");
  assert.equal(result.request?.headers?.host, "ai360.africa");
});

test("keeps numeric, boolean and null event data intact", () => {
  const result = redactSentryEvent(
    event({
      extra: { durationMs: 1_400, ok: false, count: 3, nullable: null },
    }),
  );
  assert.deepEqual(result.extra, {
    durationMs: 1_400,
    ok: false,
    count: 3,
    nullable: null,
  });
});

test("drops private-shaped keys at any nesting depth", () => {
  const result = redactSentryEvent(
    event({
      extra: { outer: { inner: { prompt: "keep out", route: "/x" } } },
    }),
  );
  const inner = (result.extra?.outer as Record<string, unknown>)
    .inner as Record<string, unknown>;
  assert.equal(inner.prompt, undefined);
  assert.equal(inner.route, "/x");
});
