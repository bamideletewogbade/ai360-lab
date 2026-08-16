import "server-only";

/**
 * Fire-and-forget shipping of the existing structured log lines to Axiom
 * (NDJSON ingest).
 *
 * Console output remains the source of truth; this is a second destination so
 * logs become searchable, retained and alertable. The sink must never block a
 * request, never throw, and never be the reason a log line is lost in the app
 * itself — on any failure the batch is dropped and the console copy still
 * exists.
 */

type SinkEntry = Record<string, unknown>;

const MAX_QUEUE = 200;
const FLUSH_INTERVAL_MS = 2_000;

let queue: SinkEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let checked = false;
let configuration: { token: string; dataset: string } | null = null;

function sinkConfiguration() {
  if (checked) return configuration;
  checked = true;
  const token = process.env.AXIOM_TOKEN?.trim();
  const dataset = process.env.AXIOM_DATASET?.trim();
  configuration = token && dataset ? { token, dataset } : null;
  return configuration;
}

async function flush() {
  const config = sinkConfiguration();
  if (!config || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await fetch(
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(config.dataset)}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: batch.map((entry) => JSON.stringify(entry)).join("\n"),
        signal: AbortSignal.timeout(10_000),
        keepalive: true,
      },
    );
  } catch {
    // Telemetry must never break the app. A dropped batch is acceptable.
  }
}

/** Queue one structured log entry for Axiom; a no-op unless configured. */
export function logSinkSend(entry: SinkEntry) {
  if (!sinkConfiguration()) return;
  queue.push(entry);
  if (queue.length >= MAX_QUEUE) {
    void flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
  }
}
