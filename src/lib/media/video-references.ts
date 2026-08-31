import "server-only";
import type { MediaIntent } from "@/lib/media/intent";
import { downloadGeneratedMedia } from "@/lib/media/storage";
import type { VideoFrameType } from "@/lib/media/video-catalogue";
import type { WorkspaceAuthContext } from "@/lib/workspace";

/**
 * Turns the reference assets on an intent into the image payload OpenRouter
 * accepts.
 *
 * Two arrays, per the provider's video API:
 *
 *   frame_images[]     — {type, image_url:{url}, frame_type} for image-to-video
 *   input_references[] — {type, image_url:{url}} for style or subject guidance
 *
 * Both take a public https URL or a `data:<mime>;base64,<data>` URI. AI360's
 * media lives in a private bucket with no public URL, so it goes as a data URI:
 * minting a signed public link for every render would put customer images on a
 * guessable URL for the life of the token, which is a worse trade than a larger
 * request body.
 */

const REFERENCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Generous for a photograph, well inside what the providers accept. */
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

/**
 * Every reference together, before base64 inflates them by a third. The whole
 * body has to cross to the provider inside the submit timeout, so this is a
 * deliverability limit rather than a policy one.
 */
const MAX_TOTAL_REFERENCE_BYTES = 12 * 1024 * 1024;

const MAX_INPUT_REFERENCES = 4;

const FRAME_ROLES = new Set<string>(["first_frame", "last_frame"]);

export class VideoReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoReferenceError";
  }
}

type ImagePayload = { type: "image_url"; image_url: { url: string } };
type FramePayload = ImagePayload & { frame_type: VideoFrameType };

export type ResolvedVideoReferences = {
  frameImages: FramePayload[];
  inputReferences: ImagePayload[];
  /** Frame positions actually supplied, for model routing. */
  frameTypes: VideoFrameType[];
  /**
   * Roles accepted by AI360 but dropped before the provider call because
   * `frame_images` takes precedence over `input_references`. Surfaced so the
   * person can be told, rather than paying for a render that quietly ignored
   * the logo they attached.
   */
  ignoredRoles: string[];
  totalBytes: number;
};

export const EMPTY_VIDEO_REFERENCES: ResolvedVideoReferences = {
  frameImages: [],
  inputReferences: [],
  frameTypes: [],
  ignoredRoles: [],
  totalBytes: 0,
};

/**
 * Frame positions on an intent, without reading a single byte.
 *
 * Model routing and the price quote both need to know that a frame is coming
 * before it is worth downloading anything, so this stays cheap and is safe to
 * call on the quote path.
 */
export function intendedFrameTypes(intent: MediaIntent): VideoFrameType[] {
  const seen = new Set<VideoFrameType>();
  for (const reference of intent.references) {
    if (FRAME_ROLES.has(reference.role)) seen.add(reference.role as VideoFrameType);
  }
  // Ordered, not insertion-ordered, so the same attachment always routes and
  // prices identically however the client happened to list it.
  return (["first_frame", "last_frame"] as const).filter((frame) => seen.has(frame));
}

export function hasVideoReferences(intent: MediaIntent) {
  return intent.references.length > 0;
}

/**
 * Reads one workspace asset. Injectable so the rules below — size ceilings,
 * duplicate frames, provider precedence — can be tested as behaviour instead
 * of inspected as source.
 */
export type ReferenceAssetLoader = (
  assetId: string,
) => Promise<{ bytes: ArrayBuffer; mimeType: string } | null>;

export async function resolveVideoReferences(input: {
  context: WorkspaceAuthContext;
  intent: MediaIntent;
  loadAsset?: ReferenceAssetLoader;
}): Promise<ResolvedVideoReferences> {
  const loadAsset: ReferenceAssetLoader =
    input.loadAsset ?? ((assetId) => downloadGeneratedMedia(input.context, assetId));
  const references = input.intent.references;
  if (!references.length) return EMPTY_VIDEO_REFERENCES;

  const frames = references.filter((reference) => FRAME_ROLES.has(reference.role));
  const guidance = references.filter((reference) => !FRAME_ROLES.has(reference.role));

  // Taking "the first one" would silently discard a deliberate choice, and the
  // person would have no way to tell which of their two first frames was used.
  for (const frameType of ["first_frame", "last_frame"]) {
    if (frames.filter((reference) => reference.role === frameType).length > 1) {
      throw new VideoReferenceError(
        `Only one ${frameType.replace("_", " ")} can be used. Remove the extra one and try again.`,
      );
    }
  }
  if (guidance.length > MAX_INPUT_REFERENCES) {
    throw new VideoReferenceError(
      `Use at most ${MAX_INPUT_REFERENCES} reference images. Remove a few and try again.`,
    );
  }

  const frameImages: FramePayload[] = [];
  const inputReferences: ImagePayload[] = [];
  let totalBytes = 0;

  // Frames first, so the budget is spent on what the provider will actually
  // honour when both kinds are present.
  for (const reference of [...frames, ...guidance]) {
    // Workspace-scoped by construction: an asset belonging to anyone else
    // simply does not resolve, so a reference cannot reach across workspaces.
    const asset = await loadAsset(reference.assetId);
    if (!asset) {
      throw new VideoReferenceError(
        "One of the reference images is no longer available. Remove it and try again.",
      );
    }
    if (!REFERENCE_IMAGE_TYPES.has(asset.mimeType)) {
      throw new VideoReferenceError(
        "References have to be images. Remove the video and try again.",
      );
    }
    const bytes = new Uint8Array(asset.bytes);
    if (bytes.byteLength > MAX_REFERENCE_BYTES) {
      throw new VideoReferenceError(
        "One of the reference images is too large. Use an image under 8MB.",
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_REFERENCE_BYTES) {
      throw new VideoReferenceError(
        "The reference images are too large together. Remove one or use smaller images.",
      );
    }

    const url = `data:${asset.mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    if (FRAME_ROLES.has(reference.role)) {
      frameImages.push({
        type: "image_url",
        image_url: { url },
        frame_type: reference.role as VideoFrameType,
      });
    } else {
      inputReferences.push({ type: "image_url", image_url: { url } });
    }
  }

  // The provider treats a request with frames as image-to-video and ignores
  // input_references entirely. Sending both would bill for guidance that was
  // never applied, so they are dropped here and named to the caller.
  const framesWin = frameImages.length > 0 && inputReferences.length > 0;
  return {
    frameImages,
    inputReferences: framesWin ? [] : inputReferences,
    frameTypes: frameImages.map((frame) => frame.frame_type),
    ignoredRoles: framesWin
      ? [...new Set(guidance.map((reference) => reference.role))]
      : [],
    totalBytes,
  };
}
