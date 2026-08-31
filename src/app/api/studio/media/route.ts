import { getOptionalAuthContext } from "@/lib/auth";
import { rateLimit } from "@/lib/guardrails";
import { errorDetails, requestLogger } from "@/lib/observability";
import {
  isMediaJobStoreConfigured,
  listActiveVideoJobs,
  listMediaJobs,
  listRecentMediaJobs,
  readMediaJob,
} from "@/lib/media/job-repository";
import { deleteGeneratedMedia, downloadGeneratedMedia } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const log = requestLogger(request, "/api/studio/media");
  const limited = rateLimit(request, "studio_video_status", {
    minute: 40,
    daily: 600,
  });
  if (limited)
    return new Response(limited.body, {
      status: limited.status,
      headers: log.headers(limited.headers),
    });
  try {
    const context = await getOptionalAuthContext();
    if (!context) {
      log.finish(401, { outcome: "sign_in_required" });
      return Response.json(
        { error: "Sign in to open saved media." },
        { status: 401, headers: log.headers() },
      );
    }
    if (!isMediaJobStoreConfigured()) {
      log.finish(503, { outcome: "not_configured" });
      return Response.json(
        { error: "Saved media is not configured." },
        { status: 503, headers: log.headers() },
      );
    }
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    if (assetId) {
      const asset = await downloadGeneratedMedia(context, assetId);
      if (!asset) {
        log.finish(404, { outcome: "not_found" });
        return Response.json(
          { error: "This media file was not found." },
          { status: 404, headers: log.headers() },
        );
      }
      log.finish(200, { outcome: "download", byteSize: asset.byteSize });
      return new Response(asset.bytes, {
        headers: log.headers({
          "Content-Type": asset.mimeType,
          "Content-Length": String(asset.byteSize),
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="ai360-media.${asset.mimeType.startsWith("video/") ? "mp4" : "png"}"`,
        }),
      });
    }
    const jobId = url.searchParams.get("jobId");
    if (jobId) {
      const job = await readMediaJob(context, jobId);
      log.finish(job ? 200 : 404, { outcome: job ? "job" : "not_found" });
      return Response.json(
        job ? { job } : { error: "This media job was not found." },
        {
          status: job ? 200 : 404,
          headers: log.headers({ "Cache-Control": "no-store" }),
        },
      );
    }
    if (url.searchParams.get("recent") === "1") {
      const jobs = await listRecentMediaJobs(context, 24);
      log.finish(200, { outcome: "recent", count: jobs.length });
      return Response.json(
        { jobs },
        { headers: log.headers({ "Cache-Control": "no-store" }) },
      );
    }
    if (url.searchParams.get("active") === "1") {
      const jobs = await listActiveVideoJobs(context, 10);
      log.finish(200, { outcome: "active", count: jobs.length });
      return Response.json(
        { jobs },
        { headers: log.headers({ "Cache-Control": "no-store" }) },
      );
    }
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      log.finish(400, { outcome: "missing_scope" });
      return Response.json(
        { error: "Choose a project or media job." },
        { status: 400, headers: log.headers() },
      );
    }
    const jobs = await listMediaJobs(context, projectId);
    log.finish(200, { outcome: "list", count: jobs.length });
    return Response.json(
      { jobs },
      { headers: log.headers({ "Cache-Control": "no-store" }) },
    );
  } catch (error) {
    log.error("studio.media.failed", errorDetails(error));
    log.finish(500, { outcome: "exception" });
    return Response.json(
      { error: "Saved media could not be opened." },
      { status: 500, headers: log.headers() },
    );
  }
}

export async function DELETE(request: Request) {
  const log = requestLogger(request, "/api/studio/media");
  const limited = rateLimit(request, "studio_media_delete", {
    minute: 20,
    daily: 200,
  });
  if (limited)
    return new Response(limited.body, {
      status: limited.status,
      headers: log.headers(limited.headers),
    });

  try {
    const context = await getOptionalAuthContext();
    if (!context) {
      log.finish(401, { outcome: "sign_in_required" });
      return Response.json(
        { error: "Sign in to delete saved media." },
        { status: 401, headers: log.headers() },
      );
    }
    if (!isMediaJobStoreConfigured()) {
      log.finish(503, { outcome: "not_configured" });
      return Response.json(
        { error: "Saved media is not configured." },
        { status: 503, headers: log.headers() },
      );
    }

    const body = await request.json().catch(() => null) as { jobId?: unknown } | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId || jobId.length > 96) {
      log.finish(400, { outcome: "invalid_job" });
      return Response.json(
        { error: "Choose a valid media item to delete." },
        { status: 400, headers: log.headers() },
      );
    }

    const result = await deleteGeneratedMedia(context, jobId);
    if (result === "not_found") {
      log.finish(404, { outcome: "not_found" });
      return Response.json(
        { error: "This media item was not found." },
        { status: 404, headers: log.headers() },
      );
    }
    if (result === "active") {
      log.finish(409, { outcome: "still_rendering" });
      return Response.json(
        { error: "Wait for this media item to finish before deleting it." },
        { status: 409, headers: log.headers() },
      );
    }

    log.info("studio.media.deleted", { jobId });
    log.finish(200, { outcome: "deleted" });
    return Response.json({ ok: true }, { headers: log.headers() });
  } catch (error) {
    log.error("studio.media.delete_failed", errorDetails(error));
    log.finish(500, { outcome: "exception" });
    return Response.json(
      { error: "This media item could not be deleted." },
      { status: 500, headers: log.headers() },
    );
  }
}
