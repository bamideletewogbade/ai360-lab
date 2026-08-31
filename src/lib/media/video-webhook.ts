import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature verification for OpenRouter video callbacks.
 *
 * The scheme, per OpenRouter's video-generation webhook documentation:
 *
 *   X-OpenRouter-Signature: t=<unix_seconds>,v1=<hmac>
 *
 * where <hmac> is HMAC-SHA256, hex encoded, over the bytes of
 * `<timestamp>,<raw_body>` — the raw body exactly as delivered, never a
 * re-serialised copy of the parsed JSON, because re-serialising changes key
 * order and whitespace and would fail every legitimate delivery.
 *
 * Lives outside the route so the check can be tested directly. This is the
 * only thing standing between an unauthenticated POST and a path that marks
 * jobs delivered and settles credit holds, so it is worth more than an
 * inspection.
 */

/** OpenRouter's documented tolerance, in seconds, either side of now. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function signVideoWebhook(input: {
  rawBody: Uint8Array;
  timestamp: number;
  secret: string;
}) {
  return createHmac("sha256", input.secret)
    .update(
      Buffer.concat([
        Buffer.from(`${input.timestamp},`, "utf8"),
        Buffer.from(input.rawBody),
      ]),
    )
    .digest("hex");
}

export function verifyVideoWebhookSignature(input: {
  rawBody: Uint8Array;
  header: string;
  secret: string;
  /** Injectable so the tolerance window can be tested without waiting. */
  nowSeconds?: number;
}) {
  if (!input.secret) return false;
  const parts = input.header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const supplied = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !supplied) return false;
  if (!/^\d{1,15}$/.test(timestamp)) return false;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const age = now - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = signVideoWebhook({
    rawBody: input.rawBody,
    timestamp: Number(timestamp),
    secret: input.secret,
  });
  // `digest("hex")` is lowercase and `timingSafeEqual` compares bytes, so an
  // uppercase signature would otherwise be read as a forgery rather than as
  // the same value written differently.
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied.toLowerCase(), "utf8");
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
