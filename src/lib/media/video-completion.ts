import "server-only";
import { estimateCredits } from "@/lib/billing/credits";
import { settleReservation } from "@/lib/billing/credit-repository";
import { updateMediaJobResult, type MediaJob } from "@/lib/media/job-repository";
import { persistGeneratedMedia } from "@/lib/media/storage";
import type { WorkspaceAuthContext } from "@/lib/workspace";

/**
 * The one place a video render is finished.
 *
 * A clip can reach its ending through three different doors: the browser that
 * is still polling, the provider's webhook, or the reconciliation worker that
 * sweeps up whatever neither of those delivered. Each of those used to carry
 * its own copy of "download it, store it, mark the job, settle the hold", and
 * the copies had already drifted — the webhook told a filtered customer
 * something different from the route, and only the route knew that a filtered
 * render is not a technical fault. Three doors, one room.
 */

export type VideoTerminalStatus = "completed" | "failed" | "cancelled" | "expired";

const TERMINAL_STATUSES = new Set<string>([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export function isVideoTerminalStatus(value: unknown): value is VideoTerminalStatus {
  return typeof value === "string" && TERMINAL_STATUSES.has(value);
}

function clean(value: unknown, max = 500) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").trim().slice(0, max)
    : "";
}

/**
 * A refusal is not an outage.
 *
 * Retrying a filtered prompt produces the same refusal every time, so telling
 * someone "the provider could not complete this render" sends them to press a
 * button that cannot work. The two cases need different words because they
 * need different actions from the person reading them.
 */
export function videoFailureCode(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("filtered") ||
    normalized.includes("moderation") ||
    normalized.includes("policy")
  ) {
    return "provider_filtered";
  }
  return "provider_failed";
}

export function videoFailureMessage(message: string) {
  return videoFailureCode(message) === "provider_filtered"
    ? "This video could not be produced because the provider filtered the request. No credits were charged. Try describing the same creative idea with adult subjects and without combining violence, illegal activity or other sensitive details."
    : clean(message) || "The video provider could not complete this render.";
}

export async function downloadProviderVideo(providerJobId: string) {
  const response = await fetch(
    `https://openrouter.ai/api/v1/videos/${encodeURIComponent(providerJobId)}/content?index=0`,
    {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}` },
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Video download returned ${response.status}`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0] || "video/mp4",
  };
}

export type VideoFinalizeResult = {
  delivered: boolean;
  settled: boolean;
  status: "completed" | "failed" | "cancelled";
  errorCode?: string;
};

/**
 * Store the output if there is one, mark the job, and release or charge the
 * hold — in that order, and safe to call twice for the same job.
 *
 * Order matters. Marking a job completed before its bytes are in storage would
 * hand someone a finished render they cannot open, and settling before either
 * would charge for it. Repeat safety matters just as much: the webhook and the
 * worker can legitimately arrive at the same job at the same moment, so
 * delivery is skipped when an output already exists and `settleReservation`
 * only acts on a hold still marked `held`.
 */
export async function finalizeVideoJob(input: {
  job: MediaJob;
  context: WorkspaceAuthContext;
  providerJobId: string;
  status: VideoTerminalStatus;
  measuredUsd?: number | null;
  providerError?: string;
  /** Recorded on the stored asset so delivery can be traced to its door. */
  deliveredBy: "openrouter_webhook" | "reconciliation_worker";
  model?: string | null;
}): Promise<VideoFinalizeResult> {
  const { job, context, status } = input;
  const measuredUsd = input.measuredUsd ?? undefined;
  let delivered = false;

  if (status === "completed") {
    if (!job.outputAssetId) {
      const file = await downloadProviderVideo(input.providerJobId);
      await persistGeneratedMedia({
        context,
        jobId: job.id,
        projectId: job.projectId,
        bytes: file.bytes,
        mimeType: file.mimeType,
        metadata: {
          model: job.model || input.model || "unknown",
          duration: job.intent.durationSeconds || 4,
          aspectRatio: job.intent.aspectRatio,
          qualityTier: job.intent.qualityTier,
          deliveredBy: input.deliveredBy,
        },
      });
      delivered = true;
    }
    await updateMediaJobResult({
      context,
      jobId: job.id,
      status: "completed",
      actualCostUsd: measuredUsd,
    });
  } else {
    const rawError = clean(input.providerError) || `Video generation ${status}.`;
    await updateMediaJobResult({
      context,
      jobId: job.id,
      status: status === "cancelled" ? "cancelled" : "failed",
      actualCostUsd: measuredUsd,
      errorCode: videoFailureCode(rawError),
      errorMessage: videoFailureMessage(rawError),
    });
  }

  let settled = false;
  if (job.reservationId) {
    const settlement = await settleReservation({
      context,
      reservationId: job.reservationId,
      estimate: estimateCredits("video", {
        quotedUsd: job.quotedCostUsd ?? undefined,
      }),
      measuredUsd,
      outcome: status === "completed" ? "success" : "failure",
    });
    settled = settlement.ok;
  }

  return {
    delivered,
    settled,
    status: status === "completed"
      ? "completed"
      : status === "cancelled"
        ? "cancelled"
        : "failed",
    ...(status === "completed"
      ? {}
      : { errorCode: videoFailureCode(clean(input.providerError)) }),
  };
}
