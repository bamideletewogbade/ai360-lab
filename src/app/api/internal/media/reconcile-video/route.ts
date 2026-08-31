import { timingSafeEqual } from "node:crypto";
import { estimateCredits } from "@/lib/billing/credits";
import { settleReservation } from "@/lib/billing/credit-repository";
import {
  claimMediaWebhookEvent,
  finishMediaWebhookEvent,
  isMediaJobStoreConfigured,
  listStaleVideoJobsForReconciliation,
  updateMediaJobResult,
} from "@/lib/media/job-repository";
import {
  finalizeVideoJob,
  isVideoTerminalStatus,
} from "@/lib/media/video-completion";
import { errorDetails, requestLogger } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finish video renders that nothing else finished.
 *
 * Completion used to depend on a browser staying open: the tab polled, and if
 * it closed the render was orphaned with the customer's credits still held.
 * The webhook removed most of that dependency, but a webhook is a single
 * delivery attempt against a system that can be mid-deploy, and a missed one
 * fails in the direction that costs the customer money. This sweep is the
 * backstop that makes completion genuinely server-owned: whatever door a
 * render was supposed to leave by, it leaves.
 */

/** Long enough that the browser's own polling is not raced to the delivery. */
const STALE_SECONDS = 180;

/**
 * When a provider has said nothing terminal for this long, the render is
 * treated as lost and the hold is returned.
 *
 * Holding credits indefinitely for a job the provider has quietly dropped is
 * the worst of both outcomes — no video, and no spending power to try again.
 * Six hours is far beyond any legitimate render, so reaching it means the job
 * is gone rather than slow.
 */
const ABANDON_AFTER_MS = 6 * 60 * 60 * 1_000;

const BATCH_LIMIT = 25;

function authorized(request: Request) {
  const configured =
    process.env.AI360_MEDIA_RECONCILE_SECRET || process.env.CRON_SECRET || "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

async function providerHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://ai360.africa",
    "X-Title": process.env.OPENROUTER_SITE_NAME || "AI360",
  };
}

type Outcome =
  | "completed"
  | "failed"
  | "cancelled"
  | "pending"
  | "abandoned"
  | "lost"
  | "claimed_elsewhere"
  | "unreadable";

export async function POST(request: Request) {
  const log = requestLogger(request, "/api/internal/media/reconcile-video");
  if (!authorized(request)) {
    log.finish(401, { outcome: "unauthorized" });
    return Response.json(
      { error: "Not authorized." },
      { status: 401, headers: log.headers() },
    );
  }
  if (!isMediaJobStoreConfigured()) {
    log.finish(503, { outcome: "not_configured" });
    return Response.json(
      { error: "The media job store is not configured." },
      { status: 503, headers: log.headers() },
    );
  }
  if (!process.env.OPENROUTER_API_KEY) {
    log.finish(503, { outcome: "provider_not_configured" });
    return Response.json(
      { error: "The video provider is not configured." },
      { status: 503, headers: log.headers() },
    );
  }

  try {
    const stale = await listStaleVideoJobsForReconciliation({
      staleSeconds: STALE_SECONDS,
      limit: BATCH_LIMIT,
    });
    log.info("studio.video.reconcile_started", { candidates: stale.length });

    const tally: Record<Outcome, number> = {
      completed: 0,
      failed: 0,
      cancelled: 0,
      pending: 0,
      abandoned: 0,
      lost: 0,
      claimed_elsewhere: 0,
      unreadable: 0,
    };

    // Sequential on purpose. A completed clip is downloaded and re-uploaded
    // inside this loop, so running the batch in parallel would multiply peak
    // memory by the batch size for no scheduling benefit.
    for (const { job, context } of stale) {
      const providerJobId = job.providerJobId || "";
      if (!providerJobId) continue;
      const ageMs = Date.now() - new Date(job.createdAt).getTime();

      /**
       * Claims this job for this sweep, so two overlapping runs of the worker
       * cannot both work it. This does not lock against the webhook, which
       * claims under its own per-event key: what keeps the two doors safe is
       * that delivery is skipped when an output already exists and that
       * `settleReservation` only acts on a hold still marked `held`. The
       * money-side invariant holds under a race; the worst case is a duplicate
       * stored asset, which `staleSeconds` makes unlikely by keeping the sweep
       * away from jobs a callback is still expected for.
       */
      const claimed = await claimMediaWebhookEvent({
        idempotencyKey: `reconcile:${providerJobId}`,
        providerJobId,
        eventType: "video.reconciliation",
      });
      if (!claimed) {
        tally.claimed_elsewhere += 1;
        continue;
      }

      try {
        const response = await fetch(
          `https://openrouter.ai/api/v1/videos/${encodeURIComponent(providerJobId)}`,
          {
            headers: await providerHeaders(),
            signal: AbortSignal.timeout(30_000),
            cache: "no-store",
          },
        );

        // A 404 means the provider has genuinely forgotten this job, not that
        // it is briefly unreachable. Retrying forever would hold the credits
        // forever, so this is terminal and refundable.
        if (response.status === 404) {
          await updateMediaJobResult({
            context,
            jobId: job.id,
            status: "failed",
            errorCode: "provider_job_lost",
            errorMessage:
              "The video provider no longer has this render. Your credits were returned — please try again.",
          });
          if (job.reservationId) {
            await settleReservation({
              context,
              reservationId: job.reservationId,
              estimate: estimateCredits("video", {
                quotedUsd: job.quotedCostUsd ?? undefined,
              }),
              measuredUsd: null,
              outcome: "failure",
            });
          }
          tally.lost += 1;
          log.warn("studio.video.reconcile_job_lost", {
            jobId: job.id,
            providerJobId,
            ageMs,
          });
          await finishMediaWebhookEvent(`reconcile:${providerJobId}`);
          continue;
        }

        if (!response.ok) {
          tally.unreadable += 1;
          log.warn("studio.video.reconcile_status_failed", {
            jobId: job.id,
            providerJobId,
            status: response.status,
          });
          // Left claimable so the next sweep tries again rather than burying it.
          await finishMediaWebhookEvent(
            `reconcile:${providerJobId}`,
            `Provider status returned ${response.status}`,
          );
          continue;
        }

        const result = (await response.json()) as {
          status?: string;
          error?: string;
          model?: string | null;
          usage?: { cost?: number };
        };

        if (!isVideoTerminalStatus(result.status)) {
          // Still legitimately working. Give up on it only once it has run
          // long past any real render.
          if (ageMs > ABANDON_AFTER_MS) {
            await updateMediaJobResult({
              context,
              jobId: job.id,
              status: "failed",
              errorCode: "provider_abandoned",
              errorMessage:
                "This render did not finish in time. Your credits were returned — please try again.",
            });
            if (job.reservationId) {
              await settleReservation({
                context,
                reservationId: job.reservationId,
                estimate: estimateCredits("video", {
                  quotedUsd: job.quotedCostUsd ?? undefined,
                }),
                measuredUsd: null,
                outcome: "failure",
              });
            }
            tally.abandoned += 1;
            log.warn("studio.video.reconcile_abandoned", {
              jobId: job.id,
              providerJobId,
              providerStatus: result.status,
              ageMs,
            });
            await finishMediaWebhookEvent(`reconcile:${providerJobId}`);
            continue;
          }
          tally.pending += 1;
          await finishMediaWebhookEvent(
            `reconcile:${providerJobId}`,
            "Still running",
          );
          continue;
        }

        const finalized = await finalizeVideoJob({
          job,
          context,
          providerJobId,
          status: result.status,
          measuredUsd: result.usage?.cost,
          providerError: result.error,
          deliveredBy: "reconciliation_worker",
          model: result.model,
        });
        tally[finalized.status] += 1;
        log.info("studio.video.reconcile_finalized", {
          jobId: job.id,
          providerJobId,
          status: finalized.status,
          delivered: finalized.delivered,
          settled: finalized.settled,
          errorCode: finalized.errorCode,
          costUsd: result.usage?.cost,
          ageMs,
        });
        await finishMediaWebhookEvent(`reconcile:${providerJobId}`);
      } catch (error) {
        const details = errorDetails(error);
        tally.unreadable += 1;
        log.error("studio.video.reconcile_job_failed", {
          jobId: job.id,
          providerJobId,
          ...details,
        });
        // Recorded as failed so the next sweep can re-claim this job.
        await finishMediaWebhookEvent(
          `reconcile:${providerJobId}`,
          details.errorMessage,
        ).catch(() => undefined);
      }
    }

    log.info("studio.video.reconcile_complete", {
      candidates: stale.length,
      ...tally,
    });
    log.finish(200, { outcome: "complete", candidates: stale.length });
    return Response.json(
      { candidates: stale.length, ...tally },
      { headers: log.headers({ "Cache-Control": "no-store" }) },
    );
  } catch (error) {
    log.error("studio.video.reconcile_failed", errorDetails(error));
    log.finish(500, { outcome: "reconcile_failed" });
    return Response.json(
      { error: "Video reconciliation failed." },
      { status: 500, headers: log.headers() },
    );
  }
}
