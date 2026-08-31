import { createHmac, timingSafeEqual } from "node:crypto";
import {
  rateLimit,
  rejectLargeRequest,
  requireIdentifiedRequester,
  resolveRequester,
} from "@/lib/guardrails";
import {
  errorDetails,
  providerErrorDetails,
  requestLogger,
} from "@/lib/observability";
import { recordUsageEventSafe } from "@/lib/usage";
import { openCreditGate } from "@/lib/billing/credit-gate";
import { settleReservation } from "@/lib/billing/credit-repository";
import {
  estimateCredits,
  usdBudgetForCredits,
  videoCeilingCredits,
} from "@/lib/billing/credits";
import {
  defaultMediaIntent,
  mediaIntentSchema,
  type MediaIntent,
} from "@/lib/media/intent";
import {
  isVideoSelection,
  selectVideoModel,
  supportedFrameTypes,
  supportedVideoDurations,
  type VideoModelEntry,
} from "@/lib/media/video-catalogue";
import {
  videoFailureCode,
  videoFailureMessage,
} from "@/lib/media/video-completion";
import {
  EMPTY_VIDEO_REFERENCES,
  intendedFrameTypes,
  resolveVideoReferences,
  VideoReferenceError,
} from "@/lib/media/video-references";
import {
  createMediaJob,
  isMediaJobStoreConfigured,
  markMediaJobSubmitted,
  readMediaJob,
  updateMediaJobResult,
} from "@/lib/media/job-repository";
import {
  MediaStorageNotConfiguredError,
  persistGeneratedMedia,
} from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long a finished clip may keep failing delivery before the job is
 * declared failed and the hold returned.
 *
 * Retrying is right for a passing storage or network fault, but a render that
 * still cannot be saved half an hour after the provider finished is not going
 * to save itself, and leaving it `running` shows the person "Rendering…"
 * forever for work that will never arrive. The reservation TTL is two hours, so
 * this settles well inside it.
 */
const DELIVERY_DEADLINE_MS = 30 * 60 * 1_000;

type VideoRequest = {
  action?: "quote" | "submit" | "status" | "tiers";
  token?: string;
  jobId?: string;
  projectId?: string;
  intent?: unknown;
  approved?: boolean;
  acceptedCostUsd?: number;
  /** Raw-prompt mode: render straight from what the person typed, with no brand brief. */
  prompt?: string;
  businessName?: string;
  brand?: { summary?: string; voice?: string; tagline?: string };
  campaign?: { name?: string; bigIdea?: string; callToAction?: string };
  location?: string;
  asset?: { id?: string; title?: string; purpose?: string; content?: string };
};

function clean(value: unknown, max = 2_000) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").trim().slice(0, max)
    : "";
}

function requestedIntent(body: VideoRequest): MediaIntent {
  const supplied = mediaIntentSchema.safeParse(body.intent);
  if (supplied.success && supplied.data.mediaType === "video")
    return supplied.data;
  return defaultMediaIntent({
    mediaType: "video",
    purpose:
      clean(body.asset?.purpose) ||
      clean(body.asset?.title) ||
      "Create an approved promotional video",
  });
}

async function currentQuote(intent: MediaIntent) {
  const response = await fetch("https://openrouter.ai/api/v1/videos/models", {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Video model catalogue returned ${response.status}`);
  const body = (await response.json()) as {
    data?: VideoModelEntry[];
  };
  // Attached frames change both the routing and, on providers that price
  // image-to-video separately, the number quoted — so they are read before the
  // model is chosen rather than added to the body afterwards.
  const frameTypes = intendedFrameTypes(intent);
  const format = {
    durationSeconds: intent.durationSeconds || 4,
    resolution: intent.resolution,
    aspectRatio: intent.aspectRatio,
    withAudio: intent.audio !== "off",
    withFrameImages: frameTypes.length > 0,
  };
  const catalogue = body.data || [];
  const selection = selectVideoModel({
    catalogue,
    tier: intent.qualityTier,
    // Scales with length, so an eight-second clip is not judged against a
    // four-second budget and refused for being twice as long.
    budgetUsd: usdBudgetForCredits(videoCeilingCredits(format.durationSeconds)),
    format,
    frameTypes,
  });
  if (!isVideoSelection(selection)) {
    throw new Error(
      selection.reason === "no_model_supports_frames"
        ? "No engine at this quality can start from the frame you attached. Remove it, or choose another quality."
        : selection.cheapestUsd === null
          ? "No current video engine supports these choices."
          : "This video quality is above the current credit limit. Choose a shorter or lower-quality version.",
    );
  }
  return { ...selection, format, frameTypes };
}

function tokenSecret() {
  return (
    process.env.MEDIA_JOB_SIGNING_SECRET || process.env.OPENROUTER_API_KEY || ""
  );
}

function providerKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

function videoCallbackUrl() {
  if (!process.env.OPENROUTER_WEBHOOK_SECRET?.trim()) return undefined;
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.OPENROUTER_SITE_URL;
  if (!base) return undefined;
  try {
    const url = new URL("/api/webhooks/openrouter/video", base);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// The token carries the credit reservation as well as the job, because video
// work finishes long after the request that started it. Without this the hold
// could only be reclaimed by expiry, so a failed render would still cost money
// until the sweeper ran.
function signJob(id: string, reservationId?: string | null) {
  const payload = Buffer.from(
    JSON.stringify({
      id,
      createdAt: Date.now(),
      ...(reservationId ? { res: reservationId } : {}),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", tokenSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function readJob(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", tokenSecret()).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      id?: unknown;
      createdAt?: unknown;
      res?: unknown;
    };
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "number")
      return null;
    if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1_000) return null;
    return {
      id: parsed.id,
      reservationId: typeof parsed.res === "string" ? parsed.res : null,
    };
  } catch {
    return null;
  }
}

const PROMPT_MODE_EXECUTION =
  "\n\nExecution: make the requested scene coherent, intentional and visually polished. Follow the requested composition, motion and mood closely.";

function promptFor(body: VideoRequest, intent: MediaIntent) {
  // Raw-prompt mode passes the person's own words through with the execution
  // guardrails only, so a prompt like "drone over Accra at sunset" stays theirs.
  const rawPrompt = clean(body.prompt, 5_000);
  if (rawPrompt) {
    return `${rawPrompt}${PROMPT_MODE_EXECUTION}${intent.audio === "off" ? " No audio." : ` Use ${intent.audio} audio only.`}`;
  }
  return `Create a polished ${intent.durationSeconds}-second ${intent.aspectRatio} promotional video for ${clean(body.businessName, 120)}.

Brand: ${clean(body.brand?.summary)}
Voice: ${clean(body.brand?.voice, 500)}
Tagline: ${clean(body.brand?.tagline, 240)}
Campaign: ${clean(body.campaign?.name, 240)}
Big idea: ${clean(body.campaign?.bigIdea, 800)}
Call to action: ${clean(body.campaign?.callToAction, 240)}
Asset purpose: ${clean(body.asset?.purpose, 500)}
Market and location: ${clean(body.location, 240) || "Use only the supplied business context and references"}
Approved scene plan:
${clean(body.asset?.content, 5_000)}

Execution: create a coherent, visually polished piece with ${intent.motion} camera movement and a strong first frame. Ground every person, product and location in the supplied business context instead of using generic regional stereotypes. ${intent.audio === "off" ? "No audio." : `Use ${intent.audio} audio only.`} Follow the approved scene plan, including requested brand marks and text. ${intent.constraints.join(" ")}`;
}

function providerStatus(status?: string) {
  return status === "completed"
    ? ("completed" as const)
    : // `cancelled` and `expired` are terminal failures: the provider is not
      // going to render the clip, so the person must not pay for work that
      // never happened.
      status === "failed" || status === "cancelled" || status === "expired"
      ? ("failed" as const)
      : status === "in_progress" || status === "processing"
        ? ("running" as const)
        : ("submitted" as const);
}

async function fetchProviderVideo(id: string, fallbackUrls?: string[]) {
  const attempt = async (url: string, headers: HeadersInit) => {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Video download returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      mimeType:
        response.headers.get("content-type")?.split(";")[0] || "video/mp4",
    };
  };
  try {
    return await attempt(
      `https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}/content?index=0`,
      {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
      },
    );
  } catch (primaryError) {
    // The content endpoint can be unavailable for a finished job even when
    // the job is fine. The status response also carries direct signed URLs, so
    // fall back to those before declaring delivery failed.
    for (const url of fallbackUrls || []) {
      try {
        return await attempt(url, {});
      } catch {
        // Try the next candidate.
      }
    }
    throw primaryError;
  }
}

async function providerHeaders() {
  return {
    Authorization: `Bearer ${providerKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://ai360.africa",
    "X-Title": process.env.OPENROUTER_SITE_NAME || "AI360",
  };
}

export async function POST(request: Request) {
  const log = requestLogger(request, "/api/studio/video");
  const requestStartedAt = performance.now();
  const tooLarge = rejectLargeRequest(request, 250_000);
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: "request_too_large" });
    return new Response(tooLarge.body, {
      status: tooLarge.status,
      headers: log.headers(tooLarge.headers),
    });
  }
  let body: VideoRequest;
  try {
    body = await request.json();
  } catch {
    log.finish(400, { outcome: "invalid_json" });
    return Response.json(
      { error: "Invalid video request", requestId: log.requestId },
      {
        status: 400,
        headers: log.headers(),
      },
    );
  }

  /**
   * `tiers` gets its own bucket, deliberately.
   *
   * It used to share `studio_video_quote` with the binding quote, and because
   * the limit below was chosen by `action === "quote"` it fell through to the
   * generation limit of one a minute and three a day. A pure catalogue price
   * lookup — fired by the UI every time someone changes shape or length — was
   * therefore throttled harder than rendering, and it spent the quote
   * allowance on the way. The visible symptom was a stale price: the tiles kept
   * showing the previous length's figure while the render quoted the new one,
   * so a 4-second price sat on the button while the clip cost the 8-second one.
   */
  const rateScope =
    body.action === "quote"
      ? "studio_video_quote"
      : body.action === "tiers"
        ? "studio_video_tiers"
        : body.action === "status"
          ? "studio_video_status"
          : "studio_video";
  const requester = await resolveRequester(request);
  const anonymous = requireIdentifiedRequester(rateScope, requester);
  if (anonymous) {
    log.finish(anonymous.status, {
      outcome: "sign_in_required",
      action: body.action,
    });
    return new Response(anonymous.body, {
      status: anonymous.status,
      headers: log.headers(anonymous.headers),
    });
  }
  const limited = rateLimit(
    request,
    rateScope,
    // Checking on a job is a cheap read, not a paid generation, and it has to
    // outlast the job it is watching. A clip takes about 80 seconds, so a limit
    // of 8 a minute froze the progress display a third of the way through.
    // Generation itself stays tightly limited, because that is what costs money.
    body.action === "quote"
      ? { minute: 8, daily: 50 }
      : // Pricing the option cards costs nothing to serve and happens on every
        // format change, so it is limited only enough to stop a runaway loop.
        body.action === "tiers"
        ? { minute: 30, daily: 400 }
        : body.action === "status"
          ? { minute: 40, daily: 600 }
          : { minute: 1, daily: 3 },
    requester,
  );
  if (limited) {
    log.finish(limited.status, {
      outcome: "rate_limited",
      action: body.action,
    });
    return new Response(limited.body, {
      status: limited.status,
      headers: log.headers(limited.headers),
    });
  }

  if (!providerKey() || !tokenSecret()) {
    log.finish(503, { outcome: "not_configured" });
    return Response.json(
      {
        error: "Studio video generation is not configured.",
        requestId: log.requestId,
      },
      {
        status: 503,
        headers: log.headers(),
      },
    );
  }

  try {
    // The price of each quality option, from one catalogue read.
    //
    // The studio used to label the options "Cheapest" and "Sharper motion" with
    // no figures, so the only number on screen was the published range and a
    // person could pick an engine nearly three times dearer without seeing it.
    // Every price here is computed from the live provider catalogue, so the card
    // a customer reads and the amount they are charged cannot drift apart.
    if (body.action === "tiers") {
      const intent = requestedIntent(body);
      const frameTypes = intendedFrameTypes(intent);
      const format = {
        durationSeconds: intent.durationSeconds || 4,
        resolution: intent.resolution,
        aspectRatio: intent.aspectRatio,
        withAudio: intent.audio !== "off",
        withFrameImages: frameTypes.length > 0,
      };
      const response = await fetch(
        "https://openrouter.ai/api/v1/videos/models",
        { signal: AbortSignal.timeout(15_000), cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(`Video model catalogue returned ${response.status}`);
      const catalogue =
        ((await response.json()) as { data?: VideoModelEntry[] }).data || [];
      const supportedDurations = supportedVideoDurations({
        catalogue,
        resolution: format.resolution,
        aspectRatio: format.aspectRatio,
        withAudio: format.withAudio,
      });
      const budgetUsd = usdBudgetForCredits(
        videoCeilingCredits(format.durationSeconds),
      );
      const seenModels = new Set<string>();
      const tiers = (["draft", "standard", "premium"] as const).map((tier) => {
        const selection = selectVideoModel({
          catalogue,
          tier,
          budgetUsd,
          format,
          frameTypes,
        });
        if (!isVideoSelection(selection)) {
          return {
            tier,
            available: false as const,
            ...(selection.reason === "no_model_supports_frames"
              ? { reason: "no_frame_support" }
              : {}),
          };
        }
        // A long format can collapse two labels onto the same fallback model.
        // Show that engine once rather than pretending the same render is two
        // different quality choices.
        if (seenModels.has(selection.model)) {
          return { tier, available: false as const, reason: "same_engine" };
        }
        seenModels.add(selection.model);
        return {
          tier,
          available: true as const,
          model: selection.model,
          costUsd: selection.costUsd,
          credits: estimateCredits("video", { quotedUsd: selection.costUsd })
            .reserve,
        };
      });
      const frameTypeOptions = supportedFrameTypes({ catalogue, format });
      log.info("studio.video.catalogue_resolved", {
        duration: format.durationSeconds,
        resolution: format.resolution,
        aspectRatio: format.aspectRatio,
        supportedDurations,
        supportedFrameTypes: frameTypeOptions,
        requestedFrameTypes: frameTypes,
        availableTiers: tiers.filter((tier) => tier.available).map((tier) => ({
          tier: tier.tier,
          model: "model" in tier ? tier.model : undefined,
          credits: "credits" in tier ? tier.credits : undefined,
        })),
      });
      log.finish(200, { outcome: "tiers" });
      return Response.json(
        {
          tiers,
          duration: format.durationSeconds,
          resolution: format.resolution,
          aspectRatio: format.aspectRatio,
          supportedDurations,
          supportedFrameTypes: frameTypeOptions,
          requestId: log.requestId,
        },
        { headers: log.headers({ "Cache-Control": "no-store" }) },
      );
    }

    if (body.action === "quote") {
      const intent = requestedIntent(body);
      const quote = await currentQuote(intent);
      await recordUsageEventSafe({
        requestId: log.requestId,
        route: "/api/studio/video",
        feature: "video.quote",
        provider: "openrouter",
        model: quote.model,
        estimatedCostUsd: quote.costUsd,
        latencyMs: Math.round(performance.now() - requestStartedAt),
        outcome: "quote",
        metadata: {
          duration: quote.format.durationSeconds,
          resolution: quote.format.resolution,
          aspectRatio: quote.format.aspectRatio,
          tier: intent.qualityTier,
        },
      });
      log.finish(200, {
        outcome: "quote",
        model: quote.model,
        estimatedCostUsd: quote.costUsd,
      });
      return Response.json(
        {
          ...quote,
          duration: quote.format.durationSeconds,
          resolution: quote.format.resolution,
          aspectRatio: quote.format.aspectRatio,
          audio: quote.format.withAudio,
          tier: intent.qualityTier,
          credits: estimateCredits("video", { quotedUsd: quote.costUsd })
            .reserve,
          intent,
          requestId: log.requestId,
        },
        { headers: log.headers({ "Cache-Control": "no-store" }) },
      );
    }

    if (body.action === "status") {
      const durableJob =
        requester.context && body.jobId && isMediaJobStoreConfigured()
          ? await readMediaJob(requester.context, clean(body.jobId, 96))
          : null;
      const tokenJob = durableJob ? null : readJob(clean(body.token, 2_000));
      const id = durableJob?.providerJobId || tokenJob?.id;
      const reservationId =
        durableJob?.reservationId || tokenJob?.reservationId;
      if (!id) {
        log.finish(400, { outcome: "invalid_job_token" });
        return Response.json(
          {
            error: "This video job is invalid or expired.",
            requestId: log.requestId,
          },
          {
            status: 400,
            headers: log.headers(),
          },
        );
      }
      const response = await fetch(
        `https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}`,
        {
          headers: await providerHeaders(),
          signal: AbortSignal.timeout(30_000),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const failure = await providerErrorDetails(response);
        // A 404 means the provider no longer knows this job — it is gone for
        // good, not temporarily unreachable. Returning a 502 would make the
        // client retry forever against a dead job, so treat it as a terminal
        // failure: mark the durable job failed and refund the whole hold.
        if (response.status === 404 && reservationId && requester.context) {
          log.warn("studio.video.job_lost", { ...failure });
          await updateMediaJobResult({
            context: requester.context,
            jobId: durableJob?.id ?? "",
            status: "failed",
            errorCode: "provider_job_lost",
            errorMessage: "The video provider no longer has this job.",
          }).catch(() => undefined);
          const settlement = await settleReservation({
            context: requester.context,
            reservationId,
            estimate: estimateCredits("video", {
              quotedUsd: durableJob?.quotedCostUsd ?? undefined,
            }),
            measuredUsd: null,
            outcome: "failure",
          }).catch((settlementError) => {
            log.error("studio.video.settle_failed", {
              ...errorDetails(settlementError),
            });
            return null;
          });
          log.info("studio.video.job_lost_settled", {
            settled: settlement?.ok ?? false,
            released: settlement?.ok ? settlement.released : undefined,
          });
          log.finish(502, { outcome: "job_lost_refunded" });
          return Response.json(
            {
              error:
                "The video provider lost this render. Your credits were returned — please try again.",
              status: "failed",
              requestId: log.requestId,
            },
            { status: 502, headers: log.headers() },
          );
        }
        log.warn("studio.video.status_failed", { ...failure });
        log.finish(502, { outcome: "provider_error" });
        return Response.json(
          {
            error: "Video status could not be checked.",
            providerMessage: failure.providerMessage,
            requestId: log.requestId,
          },
          {
            status: 502,
            headers: log.headers(),
          },
        );
      }
      const result = (await response.json()) as {
        status?: string;
        error?: string;
        usage?: { cost?: number };
        unsigned_urls?: string[];
      };
      const providerError = clean(result.error, 500);
      const friendlyProviderError = providerError
        ? videoFailureMessage(providerError)
        : undefined;
      // The render finished in a later request than the one that reserved the
      // credits, so this is where a video is finally charged or refunded.
      //
      // Ordering matters: a `completed` clip is only worth charging for once
      // it has actually landed in storage. If the download or persist fails,
      // the job stays `running` so the next poll retries the delivery, and the
      // hold is left untouched (the reservation TTL reclaims it if the file
      // never arrives). `cancelled` and `expired` are terminal failures and
      // refund the whole hold.
      const terminal =
        result.status === "completed" ||
        result.status === "failed" ||
        result.status === "cancelled" ||
        result.status === "expired";
      const failedTerminal = terminal && result.status !== "completed";

      // The provider reports the job's whole cost on every poll, so recording
      // it each time counted one clip dozens of times over: 150 polls of three
      // renders read as $47.80 of spend against about $0.96 of real cost — and
      // that is the number a pricing decision gets made from.
      //
      // Guarding it to the first terminal poll fixed the multiplication but
      // left the same figure written to two tables at once, because
      // `updateMediaJobResult` below records it on the job as well. A video's
      // cost now lives in `lab_media_jobs` and nowhere else, so the two sources
      // cannot overlap and `lab_cost_ledger` can union them without choosing.
      // The poll is still recorded — its latency and outcome are real telemetry.
      if (terminal && durableJob?.actualCostUsd == null) {
        await recordUsageEventSafe({
          requestId: log.requestId,
          route: "/api/studio/video",
          feature: "video.status",
          provider: "openrouter",
          model: durableJob?.model || undefined,
          latencyMs: Math.round(performance.now() - requestStartedAt),
          outcome: result.status || "status",
        });
      }

      let durableAssetId = durableJob?.outputAssetId || null;
      let deliveryFailed = false;
      /** Delivery that retrying cannot fix: settle it now rather than poll on. */
      let deliveryPermanent = false;
      if (durableJob && requester.context) {
        if (result.status === "completed" && !durableAssetId) {
          try {
            const file = await fetchProviderVideo(id, result.unsigned_urls);
            const stored = await persistGeneratedMedia({
              context: requester.context,
              jobId: durableJob.id,
              projectId: durableJob.projectId,
              bytes: file.bytes,
              mimeType: file.mimeType,
              metadata: {
                model: durableJob.model || "unknown",
                duration: durableJob.intent.durationSeconds || 4,
                aspectRatio: durableJob.intent.aspectRatio,
                qualityTier: durableJob.intent.qualityTier,
              },
            });
            durableAssetId = stored.assetId;
          } catch (downloadError) {
            deliveryFailed = true;
            // An unset storage configuration cannot be retried into working,
            // and a clip that has failed delivery past the deadline is not
            // coming back either. Both are terminal, and both record the real
            // reason on the job: a generic retry note hid this failure in
            // production until the provider job had to be inspected by hand.
            const reason =
              downloadError instanceof Error
                ? downloadError.message
                : "The finished clip could not be saved.";
            deliveryPermanent =
              downloadError instanceof MediaStorageNotConfiguredError ||
              Date.now() - Date.parse(durableJob.createdAt) >
                DELIVERY_DEADLINE_MS;
            log.error("studio.video.persist_failed", {
              permanent: deliveryPermanent,
              ...errorDetails(downloadError),
            });
            await updateMediaJobResult({
              context: requester.context,
              jobId: durableJob.id,
              status: deliveryPermanent ? "failed" : "running",
              errorCode: deliveryPermanent
                ? "delivery_failed"
                : "delivery_retry",
              errorMessage: deliveryPermanent
                ? reason
                : `The finished clip could not be saved yet; the next poll retries delivery. (${reason})`,
            }).catch(() => undefined);
          }
        }
        if (!deliveryFailed) {
          await updateMediaJobResult({
            context: requester.context,
            jobId: durableJob.id,
            status: providerStatus(result.status),
            actualCostUsd: result.usage?.cost,
            errorCode: failedTerminal ? videoFailureCode(providerError) : null,
            errorMessage: failedTerminal ? friendlyProviderError || null : null,
          });
        }
      }

      const settleNow = deliveryPermanent || (terminal && !deliveryFailed);
      if (settleNow && reservationId && requester.context) {
        // A settlement fault must not break the poll it happens to run in.
        // Throwing here used to turn every later poll into a 500 the client
        // retried forever, so a delivered clip could still read as "Rendering…".
        const settlement = await settleReservation({
          context: requester.context,
          reservationId,
          estimate: estimateCredits("video", {
            quotedUsd: durableJob?.quotedCostUsd ?? result.usage?.cost,
          }),
          measuredUsd: deliveryPermanent ? null : result.usage?.cost,
          outcome:
            !deliveryPermanent && result.status === "completed"
              ? "success"
              : "failure",
        }).catch((settlementError) => {
          log.error("studio.video.settle_failed", {
            ...errorDetails(settlementError),
          });
          return null;
        });
        log.info("studio.video.settled", {
          status: deliveryPermanent ? "delivery_failed" : result.status,
          settled: settlement?.ok ?? false,
          charged: settlement?.ok ? settlement.charged : undefined,
          released: settlement?.ok ? settlement.released : undefined,
        });
      }

      // The clip cannot be delivered and will not be charged. Ending the job
      // here is what stops the studio showing an endless "Rendering…" for work
      // the person is never going to receive.
      if (deliveryPermanent) {
        log.finish(502, { outcome: "delivery_failed" });
        return Response.json(
          {
            error:
              "This render finished but could not be saved, so it was not charged. Your credits were returned — please try again.",
            status: "failed",
            jobId: durableJob?.id,
            requestId: log.requestId,
          },
          {
            status: 502,
            headers: log.headers({ "Cache-Control": "no-store" }),
          },
        );
      }

      if (deliveryFailed) {
        log.finish(502, { outcome: "delivery_retry" });
        return Response.json(
          {
            error:
              "Your video is ready but could not be saved yet. We will retry automatically — it will appear in the gallery shortly.",
            status: "delivery_retry",
            jobId: durableJob?.id,
            requestId: log.requestId,
          },
          {
            status: 502,
            headers: log.headers({ "Cache-Control": "no-store" }),
          },
        );
      }

      log.info("studio.video.status", {
        status: result.status,
        costUsd: result.usage?.cost,
        errorCode: failedTerminal ? videoFailureCode(providerError) : undefined,
        hasOutput: Boolean(durableAssetId),
        providerJobId: id,
      });
      log.finish(200, { outcome: "status", status: result.status });
      return Response.json(
        {
          status: result.status,
          error: failedTerminal ? friendlyProviderError : undefined,
          costUsd: result.usage?.cost,
          jobId: durableJob?.id,
          assetId: durableAssetId || undefined,
          downloadUrl:
            result.status === "completed"
              ? durableAssetId
                ? `/api/studio/media?assetId=${encodeURIComponent(durableAssetId)}`
                : `/api/studio/video?token=${encodeURIComponent(body.token || "")}`
              : undefined,
          requestId: log.requestId,
        },
        { headers: log.headers({ "Cache-Control": "no-store" }) },
      );
    }

    if (body.action !== "submit" || !body.approved) {
      log.finish(409, { outcome: "approval_required" });
      return Response.json(
        {
          error: "Approve the video asset and accept the current price first.",
          requestId: log.requestId,
        },
        { status: 409, headers: log.headers() },
      );
    }
    // Raw-prompt mode needs only the person's words; the branded mode needs
    // the approved scene plan.
    const submitPrompt = clean(body.prompt, 5_000);
    if (
      !submitPrompt &&
      (!clean(body.asset?.content) || !clean(body.businessName))
    ) {
      log.finish(409, { outcome: "approval_required" });
      return Response.json(
        {
          error: "Approve the video asset and accept the current price first.",
          requestId: log.requestId,
        },
        { status: 409, headers: log.headers() },
      );
    }

    const intent = requestedIntent(body);
    const quote = await currentQuote(intent);
    if (
      typeof body.acceptedCostUsd !== "number" ||
      Math.abs(body.acceptedCostUsd - quote.costUsd) > 0.0001
    ) {
      log.finish(409, {
        outcome: "quote_changed",
        estimatedCostUsd: quote.costUsd,
      });
      return Response.json(
        {
          error: "The video price changed. Please review the new quote.",
          quote,
          requestId: log.requestId,
        },
        { status: 409, headers: log.headers() },
      );
    }

    /**
     * Resolved before any credit is held.
     *
     * A reference that cannot be used — missing, too large, a video, two first
     * frames — makes the whole render impossible, and finding that out after
     * the hold is placed means reserving someone's credits for work that was
     * never going to start.
     */
    let references = EMPTY_VIDEO_REFERENCES;
    if (intent.references.length) {
      if (!requester.context) {
        log.finish(401, { outcome: "references_require_identity" });
        return Response.json(
          {
            error: "Sign in to use your own images as references.",
            requestId: log.requestId,
          },
          { status: 401, headers: log.headers() },
        );
      }
      try {
        references = await resolveVideoReferences({
          context: requester.context,
          intent,
        });
      } catch (error) {
        if (!(error instanceof VideoReferenceError)) throw error;
        log.warn("studio.video.reference_rejected", {
          ...errorDetails(error),
          referenceCount: intent.references.length,
        });
        log.finish(422, { outcome: "reference_rejected" });
        return Response.json(
          { error: error.message, requestId: log.requestId },
          { status: 422, headers: log.headers() },
        );
      }
    }

    // The accepted quote is a real provider price, so it decides the hold
    // rather than the published range.
    const credit = await openCreditGate({
      request,
      requester,
      feature: "video",
      requestId: log.requestId,
      quotedUsd: quote.costUsd,
    });
    if (credit.denied) {
      log.finish(credit.denied.status, {
        outcome: "credit_denied",
        estimatedCostUsd: quote.costUsd,
      });
      return new Response(credit.denied.body, {
        status: credit.denied.status,
        headers: log.headers(credit.denied.headers),
      });
    }
    const gate = credit.gate;
    const durable = Boolean(requester.context && isMediaJobStoreConfigured());
    const jobId = `media_${crypto.randomUUID()}`;
    if (durable && requester.context) {
      await createMediaJob({
        context: requester.context,
        id: jobId,
        projectId: clean(body.projectId, 64) || undefined,
        projectAssetId: clean(body.asset?.id, 64) || undefined,
        intent,
        idempotencyKey: `video:${request.headers.get("idempotency-key") || log.requestId}`,
        quotedCostUsd: quote.costUsd,
        reservationId: gate.reservationId,
      });
    }

    log.info("studio.video.started", {
      model: quote.model,
      duration: quote.format.durationSeconds,
      resolution: quote.format.resolution,
      aspectRatio: quote.format.aspectRatio,
      audio: quote.format.withAudio,
      tier: intent.qualityTier,
      acceptedCostUsd: quote.costUsd,
      creditsReserved: gate.reserved,
      callbackConfigured: Boolean(videoCallbackUrl()),
      frameTypes: references.frameTypes,
      inputReferenceCount: references.inputReferences.length,
      referenceBytes: references.totalBytes,
      // Named rather than silent: the provider ignores input_references once a
      // frame is present, so this is guidance the person supplied and did not
      // get. It is the line to look at when someone says their logo is absent.
      ignoredReferenceRoles: references.ignoredRoles,
    });
    const callbackUrl = videoCallbackUrl();
    const response = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: await providerHeaders(),
      // References travel inline as data URIs, so a submit carrying a dozen
      // megabytes of photographs needs longer than a bare prompt.
      signal: AbortSignal.timeout(references.totalBytes ? 120_000 : 30_000),
      body: JSON.stringify({
        model: quote.model,
        prompt: promptFor(body, intent),
        duration: quote.format.durationSeconds,
        resolution: quote.format.resolution,
        aspect_ratio: quote.format.aspectRatio,
        generate_audio: quote.format.withAudio,
        ...(references.frameImages.length
          ? { frame_images: references.frameImages }
          : {}),
        ...(references.inputReferences.length
          ? { input_references: references.inputReferences }
          : {}),
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      }),
    });
    if (!response.ok) {
      const failure = await providerErrorDetails(response);
      const failureCode = videoFailureCode(failure.providerMessage || "");
      const failureMessage = videoFailureMessage(failure.providerMessage || "");
      log.error("studio.video.failed", { model: quote.model, failureCode, ...failure });
      await gate.settle("failure");
      if (durable && requester.context) {
        await updateMediaJobResult({
          context: requester.context,
          jobId,
          status: "failed",
          errorCode: failureCode,
          errorMessage: failureMessage,
        }).catch(() => undefined);
      }
      log.finish(502, { outcome: "provider_error" });
      return Response.json(
        {
          error: failureMessage,
          providerMessage: failure.providerMessage,
          requestId: log.requestId,
        },
        {
          status: 502,
          headers: log.headers(),
        },
      );
    }
    const result = (await response.json()) as { id?: string; status?: string };
    if (!result.id) {
      await gate.settle("failure");
      if (durable && requester.context) {
        await updateMediaJobResult({
          context: requester.context,
          jobId,
          status: "failed",
          errorCode: "missing_provider_job",
          errorMessage: "The provider returned no video job ID.",
        }).catch(() => undefined);
      }
      throw new Error("Provider returned no video job ID");
    }
    const token = signJob(result.id, gate.reservationId);
    if (durable && requester.context) {
      await markMediaJobSubmitted({
        context: requester.context,
        jobId,
        provider: "openrouter",
        model: quote.model,
        providerJobId: result.id,
        status:
          providerStatus(result.status) === "running" ? "running" : "submitted",
      });
    }
    await recordUsageEventSafe({
      requestId: log.requestId,
      route: "/api/studio/video",
      feature: "video.submit",
      provider: "openrouter",
      model: quote.model,
      estimatedCostUsd: quote.costUsd,
      latencyMs: Math.round(performance.now() - requestStartedAt),
      outcome: "submitted",
      metadata: {
        duration: quote.format.durationSeconds,
        resolution: quote.format.resolution,
        aspectRatio: quote.format.aspectRatio,
        tier: intent.qualityTier,
      },
    });
    log.info("studio.video.submitted", {
      model: quote.model,
      status: result.status,
    });
    log.finish(202, { outcome: "submitted", model: quote.model });
    return Response.json(
      {
        token,
        jobId: durable ? jobId : undefined,
        status: result.status || "pending",
        model: quote.model,
        estimatedCostUsd: quote.costUsd,
        requestId: log.requestId,
      },
      { status: 202, headers: log.headers({ "Cache-Control": "no-store" }) },
    );
  } catch (error) {
    log.error("studio.video.failed", { ...errorDetails(error) });
    const configurationMessage =
      error instanceof Error &&
      (error.message.startsWith("No current video engine") ||
        error.message.startsWith("This video quality"))
        ? error.message
        : null;
    const status = configurationMessage ? 422 : 500;
    log.finish(status, {
      outcome: configurationMessage ? "unsupported_configuration" : "exception",
    });
    return Response.json(
      {
        error: configurationMessage || "Video generation failed.",
        requestId: log.requestId,
      },
      {
        status,
        headers: log.headers(),
      },
    );
  }
}

export async function GET(request: Request) {
  const log = requestLogger(request, "/api/studio/video");
  const limited = rateLimit(request, "studio_video_status", {
    minute: 8,
    daily: 100,
  });
  if (limited) {
    log.finish(limited.status, { outcome: "rate_limited", action: "download" });
    return new Response(limited.body, {
      status: limited.status,
      headers: log.headers(limited.headers),
    });
  }
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!providerKey() || !tokenSecret()) {
    log.finish(503, { outcome: "not_configured" });
    return Response.json(
      {
        error: "Studio video generation is not configured.",
        requestId: log.requestId,
      },
      {
        status: 503,
        headers: log.headers(),
      },
    );
  }
  const id = readJob(token)?.id;
  if (!id) {
    log.finish(400, { outcome: "invalid_job_token" });
    return Response.json(
      {
        error: "This video download is invalid or expired.",
        requestId: log.requestId,
      },
      {
        status: 400,
        headers: log.headers(),
      },
    );
  }
  try {
    const response = await fetch(
      `https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}/content?index=0`,
      {
        headers: { Authorization: `Bearer ${providerKey()}` },
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      },
    );
    if (!response.ok || !response.body) {
      const failure = await providerErrorDetails(response);
      log.error("studio.video.download_failed", { ...failure });
      log.finish(502, { outcome: "provider_error" });
      return Response.json(
        { error: "The video file is not ready.", requestId: log.requestId },
        {
          status: 502,
          headers: log.headers(),
        },
      );
    }
    log.info("studio.video.downloaded", {
      contentType: response.headers.get("content-type"),
    });
    log.finish(200, { outcome: "success" });
    return new Response(response.body, {
      headers: log.headers({
        "Content-Type": response.headers.get("content-type") || "video/mp4",
        "Content-Disposition": 'inline; filename="ai360-studio-promo.mp4"',
        "Cache-Control": "private, max-age=300",
      }),
    });
  } catch (error) {
    log.error("studio.video.download_failed", { ...errorDetails(error) });
    log.finish(500, { outcome: "exception" });
    return Response.json(
      { error: "Video download failed.", requestId: log.requestId },
      {
        status: 500,
        headers: log.headers(),
      },
    );
  }
}
