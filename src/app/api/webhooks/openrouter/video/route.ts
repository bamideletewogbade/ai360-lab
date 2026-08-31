import {
  claimMediaWebhookEvent,
  finishMediaWebhookEvent,
  readMediaJobByProviderId,
} from "@/lib/media/job-repository";
import {
  finalizeVideoJob,
  isVideoTerminalStatus,
} from "@/lib/media/video-completion";
import { verifyVideoWebhookSignature } from "@/lib/media/video-webhook";
import { errorDetails, requestLogger } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VideoWebhookEvent = {
  type?: string;
  data?: {
    id?: string;
    status?: "completed" | "failed" | "cancelled" | "expired";
    model?: string | null;
    unsigned_urls?: string[];
    usage?: { cost?: number };
    error?: string;
  };
};

export async function POST(request: Request) {
  const log = requestLogger(request, "/api/webhooks/openrouter/video");
  const secret = process.env.OPENROUTER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    log.finish(503, { outcome: "not_configured" });
    return new Response(null, { status: 503, headers: log.headers() });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("x-openrouter-signature") || "";
  if (!verifyVideoWebhookSignature({ rawBody, header: signature, secret })) {
    log.warn("studio.video.webhook_invalid_signature");
    log.finish(401, { outcome: "invalid_signature" });
    return new Response(null, { status: 401, headers: log.headers() });
  }

  let event: VideoWebhookEvent;
  try {
    event = JSON.parse(Buffer.from(rawBody).toString("utf8")) as VideoWebhookEvent;
  } catch {
    log.finish(400, { outcome: "invalid_json" });
    return new Response(null, { status: 400, headers: log.headers() });
  }
  const providerJobId = event.data?.id?.trim() || "";
  const status = event.data?.status;
  const eventType = event.type?.trim() || "video.generation.unknown";
  const eventKey = request.headers.get("x-openrouter-idempotency-key")?.trim()
    || `${providerJobId}:${eventType}`;
  if (!providerJobId || !isVideoTerminalStatus(status)) {
    log.finish(400, { outcome: "invalid_event" });
    return new Response(null, { status: 400, headers: log.headers() });
  }

  const claimed = await claimMediaWebhookEvent({
    idempotencyKey: eventKey,
    providerJobId,
    eventType,
  });
  if (!claimed) {
    log.finish(204, { outcome: "duplicate", providerJobId, status });
    return new Response(null, { status: 204, headers: log.headers() });
  }

  try {
    const found = await readMediaJobByProviderId(providerJobId);
    if (!found) throw new Error("MEDIA_JOB_NOT_FOUND");
    const { job, context } = found;
    const measuredUsd = event.data?.usage?.cost;

    const finalized = await finalizeVideoJob({
      job,
      context,
      providerJobId,
      status,
      measuredUsd,
      providerError: event.data?.error,
      deliveredBy: "openrouter_webhook",
      model: event.data?.model,
    });

    await finishMediaWebhookEvent(eventKey);
    log.info("studio.video.webhook_processed", {
      providerJobId,
      jobId: job.id,
      status,
      model: job.model,
      costUsd: measuredUsd,
      delivered: finalized.delivered,
      settled: finalized.settled,
      errorCode: finalized.errorCode,
    });
    log.finish(204, { outcome: "processed", providerJobId, status });
    return new Response(null, { status: 204, headers: log.headers() });
  } catch (error) {
    const details = errorDetails(error);
    await finishMediaWebhookEvent(eventKey, details.errorMessage).catch(() => undefined);
    log.error("studio.video.webhook_failed", { providerJobId, status, ...details });
    log.finish(500, { outcome: "processing_failed", providerJobId, status });
    return new Response(null, { status: 500, headers: log.headers() });
  }
}
