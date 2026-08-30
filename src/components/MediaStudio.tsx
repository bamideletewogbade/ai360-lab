"use client";

import { useEffect, useRef, useState } from "react";
import { notifyCreditsChanged } from "@/components/CreditBalance";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type MediaKind = "image" | "video";
type StudioIconName =
  | "spark"
  | "image"
  | "video"
  | "download"
  | "market"
  | "food"
  | "shop"
  | "cloth"
  | "poster"
  | "city"
  | "sliders"
  | "reuse"
  | "trash"
  | "chevron";

type MediaItem = {
  id: string;
  kind: MediaKind;
  prompt: string;
  aspectRatio: string;
  styleName: string;
  url: string;
  poster?: string;
  createdAt: string;
  /** Durable server job. Guest-only results have no job and disappear locally. */
  jobId?: string;
  /** Examples ship with the studio; real work is the person's own. */
  example?: boolean;
};

/**
 * Examples are inspiration, never work. They sit behind the person's own
 * output and are labelled, so nothing here can be mistaken for something the
 * studio produced for them.
 *
 * Eight of them, four moving and four still, each one a job somebody in the
 * pilot cohort actually has — a shop's product photo, a revision diagram, a
 * newsletter cover, a proposal cover — rather than an abstract showreel. The
 * `styleName` names the person, not the technique, because the question a new
 * arrival is asking is "is this for me", not "what renderer is this".
 *
 * Every one was rendered by this product's own models via
 * `scripts/generate-studio-examples.mjs`, which holds the prompts. Nothing here
 * is stock, and nothing shows a recognisable person.
 */
const EXAMPLE_GALLERY: MediaItem[] = [
  {
    id: "example-jollof",
    kind: "video",
    prompt:
      "Close-up of jollof rice steaming in a wide pan, hands plating it — a social post for a catering business.",
    aspectRatio: "9:16",
    styleName: "For a food business",
    url: "/examples/jollof-kitchen.mp4",
    poster: "/examples/jollof-kitchen-poster.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-classroom",
    kind: "image",
    prompt:
      "A classroom seen from the back, sunlight through louvred windows — a cover for a school newsletter.",
    aspectRatio: "16:9",
    styleName: "For a teacher",
    url: "/examples/classroom.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-fabric",
    kind: "video",
    prompt:
      "A bolt of wax print fabric unrolling in slow motion as sunlight moves across the pattern.",
    aspectRatio: "9:16",
    styleName: "For a shop",
    url: "/examples/fabric-shop.mp4",
    poster: "/examples/fabric-shop-poster.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-shea",
    kind: "image",
    prompt:
      "Jars of shea butter on woven raffia in warm morning light — a product photo for a small skincare business.",
    aspectRatio: "1:1",
    styleName: "For a small business",
    url: "/examples/shea-product.png",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-coast",
    kind: "video",
    prompt:
      "A slow drift over a coastal town at golden hour — an establishing shot for a community project film.",
    aspectRatio: "16:9",
    styleName: "For a community project",
    url: "/examples/coastal-town.mp4",
    poster: "/examples/coastal-town-poster.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-watercycle",
    kind: "image",
    prompt:
      "The water cycle drawn over a savanna landscape — a diagram for a science revision sheet.",
    aspectRatio: "16:9",
    styleName: "For a student",
    url: "/examples/water-cycle.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-desk",
    kind: "video",
    prompt:
      "Morning light moving across a study desk — an opening shot for a portfolio or project video.",
    aspectRatio: "16:9",
    styleName: "For a portfolio",
    url: "/examples/study-desk.mp4",
    poster: "/examples/study-desk-poster.jpg",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-accra",
    kind: "image",
    prompt:
      "The Accra skyline at dusk from a glass office — a cover image for a business proposal.",
    aspectRatio: "16:9",
    styleName: "For a proposal",
    url: "/examples/accra-proposal.jpg",
    createdAt: "Example",
    example: true,
  },
];

/**
 * Starters are written for the work people here actually sell: a market stall,
 * a food plate, a mobile money kiosk, a church programme. Generic "futuristic
 * AI" prompts produce pictures nobody can use on a Thursday afternoon.
 */
const IMAGE_STARTERS = [
  {
    icon: "market",
    label: "Market product shot",
    text: "A jar of pure shea butter on a wooden market table, warm morning light, clean uncluttered background, plenty of empty space at the top for a headline.",
  },
  {
    icon: "food",
    label: "Food plate",
    text: "Close-up of a waakye plate with shito, boiled egg and salad on an enamel dish, natural daylight, appetising, shot from just above.",
  },
  {
    icon: "shop",
    label: "Shop front",
    text: "A neat mobile money agent kiosk on a busy street in the late afternoon, bright clean colours, friendly and trustworthy feel.",
  },
  {
    icon: "cloth",
    label: "Brand pattern",
    text: "A modern brand pattern inspired by kente weaving in gold, black and deep green, flat vector, seamless, suitable for packaging.",
  },
  {
    icon: "poster",
    label: "Poster background",
    text: "Elegant event poster background in deep purple and gold with soft light rays and generous empty space in the middle for text.",
  },
] satisfies Array<{ icon: StudioIconName; label: string; text: string }>;

const VIDEO_STARTERS = [
  {
    icon: "city",
    label: "Skyline flyover",
    text: "Slow aerial flyover of a coastal African city skyline at golden hour, warm cinematic colour, calm steady motion.",
  },
  {
    icon: "cloth",
    label: "Fabric stall pan",
    text: "Slow pan across colourful wax print fabric stacked high at a market stall, warm daylight, rich colour.",
  },
  {
    icon: "market",
    label: "Product turntable",
    text: "Slow rotating close-up of a bottle of chilled hibiscus drink on a dark table, soft studio light, condensation on the glass.",
  },
] satisfies Array<{ icon: StudioIconName; label: string; text: string }>;

/** Formats named after where the work is actually posted. */
const IMAGE_FORMATS = [
  { ratio: "1:1", label: "Square", use: "Instagram, Jiji" },
  { ratio: "9:16", label: "Tall", use: "Status, TikTok" },
  { ratio: "16:9", label: "Wide", use: "YouTube, Facebook" },
  { ratio: "2:3", label: "Poster", use: "Flyer, print" },
] as const;

const VIDEO_FORMATS = [
  { ratio: "16:9", label: "Wide", use: "YouTube, Facebook" },
  { ratio: "9:16", label: "Tall", use: "Status, TikTok" },
] as const;

const IMAGE_LOOKS = [
  { value: "Cinematic Photoreal", label: "Photoreal" },
  { value: "Studio Product Photography", label: "Product studio" },
  { value: "3D Hyper-Render", label: "3D render" },
  { value: "Minimalist Brand Identity", label: "Brand minimal" },
  { value: "Vector Illustration & Art", label: "Illustration" },
] as const;

/**
 * Three honest video tiers, all currently affordable within the video
 * ceiling. Whether a given tier can actually be bought is decided live by the
 * catalogue price, not by this list — see `tierPrices`/`unavailable` below,
 * which disables and explains a tier rather than removing it the moment a
 * price change puts it out of reach.
 */
const VIDEO_TIERS = [
  { value: "draft", label: "Quick", note: "Great for trying an idea." },
  { value: "standard", label: "Better", note: "Sharper motion and detail." },
  { value: "premium", label: "Best", note: "The strongest engine we offer." },
] as const;

/** Friendly names, so a card reads "Veo 3.1 Lite" rather than a provider slug. */
const ENGINE_NAMES: Record<string, string> = {
  "google/veo-3.1-lite": "Veo 3.1 Lite",
  "google/veo-3.1-fast": "Veo 3.1 Fast",
  "google/veo-3.1": "Veo 3.1",
  "kwaivgi/kling-v3.0-std": "Kling 3.0",
  "kwaivgi/kling-v3.0-pro": "Kling 3.0 Pro",
  "alibaba/wan-2.7": "Wan 2.7",
  "alibaba/happyhorse-1.1": "Happyhorse 1.1",
  "x-ai/grok-imagine-video": "Grok Imagine",
};

function engineName(model: string) {
  return ENGINE_NAMES[model] || model.split("/").pop() || model;
}

/** Live price of each quality option, keyed by tier. */
type TierPrice = {
  tier: string;
  available: boolean;
  model?: string;
  credits?: number;
};

/**
 * Lengths the Veo family accepts. Not a product choice: the engines take 4, 6 or
 * 8 seconds and nothing between or beyond, so offering anything else would only
 * produce a refusal. Price scales per second, and each option shows its own cost.
 */
const VIDEO_LENGTHS = [4, 6, 8] as const;

const VIDEO_MOTIONS = [
  { value: "pan", label: "Pan" },
  { value: "zoom", label: "Zoom" },
  { value: "drone", label: "Aerial" },
  { value: "static", label: "Locked" },
] as const;

/** Where each aspect ratio is usually headed, so the request carries intent. */
function channelFor(aspectRatio: string, kind: MediaKind) {
  if (aspectRatio === "9:16")
    return kind === "video" ? "instagram_story" : "whatsapp_status";
  if (aspectRatio === "16:9") return "youtube";
  if (aspectRatio === "2:3") return "print";
  return kind === "video" ? "instagram_story" : "instagram_post";
}

function StudioIcon({ name }: { name: StudioIconName }) {
  const paths: Record<StudioIconName, React.ReactNode> = {
    spark: <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
    image: (
      <>
        <rect x="3.5" y="4" width="17" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m5 18 5-5 3.2 3.2 2.2-2.2 3.6 4" />
      </>
    ),
    video: (
      <>
        <rect x="3.5" y="5" width="13" height="14" rx="2" />
        <path d="m16.5 10 4-2v8l-4-2" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    market: (
      <>
        <path d="M4 9h16l-1 10H5zM4 9l1.5-4h13L20 9" />
        <path d="M9.5 13h5" />
      </>
    ),
    food: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.2" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10v9h16v-9" />
        <path d="M3 10 5 5h14l2 5a2.6 2.6 0 0 1-4.5 1.6A2.6 2.6 0 0 1 12 11.6a2.6 2.6 0 0 1-4.5 0A2.6 2.6 0 0 1 3 10" />
      </>
    ),
    cloth: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M4 9.5h16M4 14.5h16M9.5 5v14M14.5 5v14" />
      </>
    ),
    poster: (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="1.6" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
    city: (
      <path d="M4 20V9h6v11M10 20V4h6v16M16 20v-8h4v8M2 20h20M7 12h1M13 8h1M13 12h1" />
    ),
    sliders: (
      <>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2.2" />
        <circle cx="10" cy="17" r="2.2" />
      </>
    ),
    reuse: (
      <>
        <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
        <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
        <path d="M20 4v4.5h-4.5M4 20v-4.5h4.5" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
        <path d="M10 11v5m4-5v5" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** A human reason for a failed generation, from the real API response. */
function mediaError(
  status: number,
  data: { error?: string; required?: number; status?: string },
) {
  if (status === 401) return "Sign in to generate media.";
  // Was falling through to the generic "Media generation failed", which reads
  // as a broken render rather than "wait a moment and press again".
  if (status === 429)
    return (
      data.error ||
      "Too many video requests just now. Wait a minute and try again — nothing was charged."
    );
  if (status === 402)
    return `${data.error || "You do not have enough credits for this."} Buy more credits in Settings.`;
  if (status === 409 && data.status === "quote_changed")
    return "The video price changed. Review the new quote and confirm again.";
  if (status === 409)
    return data.error || "Approve the work and confirm generation first.";
  if (status === 503)
    return "Media generation is being configured. Please try again shortly.";
  return data.error || "Media generation failed. Please try again.";
}

type VideoQuote = {
  costUsd: number;
  credits: number;
  model: string;
  intent: Record<string, unknown>;
};

type VideoJob = {
  token: string;
  jobId?: string;
  status: string;
  /** Re-show the same prompt/format in the gallery when a render finishes after a refresh. */
  prompt: string;
  duration: string;
  aspectRatio: string;
  /**
   * Set when this render is a cheap Draft preview taken instead of the tier
   * the person actually picked — offered, never forced, from the quote panel.
   * Carries what is needed to re-quote at that tier once the draft lands, so
   * "sharpen" reproduces the same shot rather than a fresh, possibly
   * different one.
   */
  previewForTier?: {
    tier: string;
    motion: string;
    seconds: number;
  };
};

/** A completed durable media job as returned by `/api/studio/media?recent=1`. */
type RecentMediaJob = {
  id: string;
  mediaType: string;
  model?: string | null;
  outputAssetId?: string | null;
  createdAt?: string;
  intent?: { purpose?: string; aspectRatio?: string };
};


/**
 * The video render is durable on the server, so the browser keeps a copy of
 * the job token. A refresh, a tab switch or a closed laptop must not orphan
 * the render: on return the component re-hydrates from this key and resumes
 * polling.
 */
const VIDEO_JOB_STORAGE = "ai360:video-job";

/** How many consecutive transient failures before polling pauses (the stored job is kept). */
const MAX_CONSECUTIVE_ERRORS = 10;

/** After a long failure streak, keep the job but slow polling to one check every five minutes. */
const SLOW_RETRY_MS = 5 * 60_000;

/**
 * Four pieces make one deliberate gallery shelf: a complete row on a typical
 * laptop, two tidy rows on a phone, and never an endless wall of output.
 */
const GALLERY_PAGE_SIZE = 4;

function readStoredVideoJob(): VideoJob | null {
  try {
    const raw = window.sessionStorage.getItem(VIDEO_JOB_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VideoJob;
    return parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** What the "need credits" panel shows: both quick top-ups and monthly plans. */
type CreditPanelState = {
  required: number;
  available: number;
  topUps: Array<{ slug: string; priceGhs: number; credits: number }>;
  plans: Array<{
    slug: string;
    name: string;
    monthlyPriceGhs: number;
    includedCredits: number;
    featured?: boolean;
  }>;
};

function imageIntent(prompt: string, aspectRatio: string) {
  return {
    version: 1,
    mediaType: "image",
    purpose: prompt.slice(0, 200) || "Create a visual",
    channel: channelFor(aspectRatio, "image"),
    aspectRatio,
    resolution: "1K",
    qualityTier: "standard",
    audio: "off",
    motion: "balanced",
    locale: "en-GH",
    variationCount: 1,
    references: [],
    constraints: [],
  };
}

function videoIntent(
  prompt: string,
  aspectRatio: string,
  motion: string,
  qualityTier: string,
  durationSeconds: number,
) {
  return {
    version: 1,
    mediaType: "video",
    purpose: prompt.slice(0, 200) || "Create a motion clip",
    channel: channelFor(aspectRatio, "video"),
    aspectRatio,
    resolution: "720p",
    durationSeconds,
    qualityTier,
    audio: "off",
    motion:
      motion === "zoom" || motion === "static"
        ? "calm"
        : motion === "drone"
          ? "dynamic"
          : "balanced",
    locale: "en-GH",
    variationCount: 1,
    references: [],
    constraints: [],
  };
}

function newRequestId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Identity for a freshly finished piece of work.
 *
 * Module scope on purpose: a clock read written inline in the component body is
 * an impure call in render scope, even when the surrounding function only ever
 * runs from a fetch handler or a timer.
 */
function newMediaId() {
  return `media-${Date.now()}`;
}

export function MediaStudio() {
  const [mode, setMode] = useState<MediaKind>("image");
  const [prompt, setPrompt] = useState("");
  const [imageAspect, setImageAspect] = useState("1:1");
  const [videoAspect, setVideoAspect] = useState("9:16");
  const [look, setLook] = useState<string>(IMAGE_LOOKS[0].value);
  const [videoTier, setVideoTier] = useState<string>("draft");
  const [videoSeconds, setVideoSeconds] = useState(4);
  const [cameraMotion, setCameraMotion] = useState("pan");
  const [generating, setGenerating] = useState(false);
  const [gallery, setGallery] = useState<MediaItem[]>(EXAMPLE_GALLERY);
  const [mediaToDelete, setMediaToDelete] = useState<MediaItem | null>(null);
  const [mediaDeleteBusy, setMediaDeleteBusy] = useState(false);
  const [mediaDeleteError, setMediaDeleteError] = useState("");
  const [galleryFilter, setGalleryFilter] = useState<"all" | MediaKind>("all");
  const [galleryPage, setGalleryPage] = useState(1);
  const [toastNotice, setToastNotice] = useState("");
  const [toastError, setToastError] = useState(false);
  const [videoQuote, setVideoQuote] = useState<VideoQuote | null>(null);
  /** Shown once a Quick render finishes: "like this? get it in real quality". */
  const [sharpenOffer, setSharpenOffer] = useState<{
    tier: string;
    prompt: string;
    aspectRatio: string;
    motion: string;
    seconds: number;
  } | null>(null);
  /**
   * A render still in flight, read straight from session storage as the initial
   * value rather than written in after mount. The studio only ever renders once
   * the workspace has hydrated on the client, so there is no server pass to
   * disagree with — and reading here means no extra render just to recover a
   * job the browser already knew about.
   */
  const [videoJob, setVideoJob] = useState<VideoJob | null>(readStoredVideoJob);
  const [creditPanel, setCreditPanel] = useState<CreditPanelState | null>(null);
  const [tierPrices, setTierPrices] = useState<TierPrice[]>([]);
  /**
   * The exact format `tierPrices` was quoted for, as `aspect|seconds`.
   *
   * Prices are per-second and per-shape, so a price only means anything
   * alongside the format it was fetched for. Holding the two together is what
   * stops the studio showing a four-second figure on an eight-second clip when
   * a refetch is dropped — rate limited, offline, or simply still in flight.
   * When this does not match the current selection the price is treated as
   * absent rather than shown, and the render falls back to confirming the
   * quote instead of pressing straight through.
   */
  const [tierPriceKey, setTierPriceKey] = useState("");
  /**
   * The quote panel renders below the composer and below the options panel, so
   * on a phone — and on a laptop with the options open — it can appear entirely
   * off screen. A button that silently spawns a decision the person cannot see
   * reads as a dead button, which is exactly how this was being experienced.
   */
  const quoteRef = useRef<HTMLDivElement | null>(null);
  // Data-saver: people on metered or slow connections do not need looping
  // video previews. This is a real constraint for this audience, not a nicety.
  const [dataSaver, setDataSaver] = useState(false);
  /**
   * The shape/look/length controls live behind a disclosure so the dock stays
   * small. Collapsed is the default: the summary line on the toggle keeps every
   * current setting readable without opening it, so nothing is hidden, only
   * folded away.
   */
  const [optionsOpen, setOptionsOpen] = useState(false);
  /**
   * An image render in flight. Video does not need its own copy — the durable
   * job already carries the prompt and shape, so a refresh mid-render still
   * redraws the placeholder card.
   */
  const [pendingImage, setPendingImage] = useState<{
    prompt: string;
    aspectRatio: string;
  } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // The prompt starts as a comfortable writing surface and grows with longer
  // descriptions. People should be able to review a useful prompt before they
  // spend credits, rather than composing through a one-line slot.
  useEffect(() => {
    const field = promptRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  }, [prompt, mode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-data: reduce)");
    const syncDataSaver = () => setDataSaver(media.matches);
    syncDataSaver();
    media.addEventListener("change", syncDataSaver);
    return () => media.removeEventListener("change", syncDataSaver);
  }, []);

  // Polling state lives in refs so a refresh-resumed poll never reads stale
  // closures and duplicate timers cannot stack after a visibility change.
  const pollTimerRef = useRef<number | null>(null);
  const pollAttemptsRef = useRef(0);
  // Seeded from the same recovered job as the state above, so the visibility
  // handler is correct from the very first render.
  const videoJobRef = useRef<VideoJob | null>(videoJob);
  /** Only tell the person once when the video service enters a long outage. */
  const pollNoticeShownRef = useRef(false);

  /** Keep the rendered job in state, in a ref and in session storage together. */
  const persistVideoJob = (job: VideoJob) => {
    videoJobRef.current = job;
    setVideoJob(job);
    try {
      window.sessionStorage.setItem(VIDEO_JOB_STORAGE, JSON.stringify(job));
    } catch {
      // Private browsing: polling still works for this session.
    }
  };

  /** Forget the job everywhere; the server-side durable job is unaffected. */
  const clearVideoJob = () => {
    videoJobRef.current = null;
    setVideoJob(null);
    try {
      window.sessionStorage.removeItem(VIDEO_JOB_STORAGE);
    } catch {
      // Nothing to clear.
    }
  };

  /** 20s, 40s, 80s, then capped at 2 minutes between transient failures. */
  const pollBackoff = (attempt: number) =>
    Math.min(20_000 * 2 ** Math.min(attempt, 3), 120_000);

  const scheduleVideoPoll = (job: VideoJob, delayMs: number) => {
    if (pollTimerRef.current !== null)
      window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = window.setTimeout(() => {
      void pollVideo(job);
    }, delayMs);
  };

  const showToast = (message: string, isError: boolean) => {
    setToastNotice(message);
    setToastError(isError);
    window.setTimeout(() => setToastNotice(""), 6000);
  };

  /**
   * Waits for the server to agree the balance has settled, then tells the rest
   * of the app to re-read it.
   *
   * The response is deliberately discarded. The studio itself no longer prints
   * a balance or a price range anywhere — the only number it shows is the exact
   * per-option price from the `tiers` call — so this exists purely for its
   * ordering: read after a render, so the header pill refetches a figure that
   * has already been debited rather than the stale one.
   */
  const loadCredits = () =>
    fetch("/api/credits", { cache: "no-store" })
      .then(() => notifyCreditsChanged())
      // The studio works perfectly well without this; the pill catches up on
      // its own schedule.
      .catch(() => undefined);

  useEffect(() => {
    void loadCredits();
  }, []);

  /**
   * Live price for each quality option.
   *
   * Re-read whenever the requested format changes, because the price is
   * per-second and per-resolution: the same tier costs a different amount for a
   * tall 8-second clip than for a wide 4-second one. Fetched only in video mode
   * so the image path makes no needless catalogue call.
   */
  useEffect(() => {
    if (mode !== "video") return;
    let cancelled = false;
    // A slower earlier request must never land after a newer one and overwrite
    // it with the wrong format's prices.
    const controller = new AbortController();
    const requestedKey = `${videoAspect}|${videoSeconds}`;
    fetch("/api/studio/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        action: "tiers",
        intent: videoIntent("", videoAspect, cameraMotion, videoTier, videoSeconds),
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.tiers)) return;
        setTierPrices(data.tiers as TierPrice[]);
        // Stamped with the format it describes, so a price can never be read
        // against a selection it was not quoted for.
        setTierPriceKey(requestedKey);
      })
      // Prices are a courtesy here; the binding quote still comes before render.
      // A failure deliberately leaves `tierPriceKey` on the old format, which
      // reads as "no price for this selection" rather than as a wrong one.
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Deliberately not keyed on `prompt` or `videoTier`: neither changes the
    // price of the options, and re-quoting on every keystroke would hammer a
    // rate-limited endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, videoAspect, videoSeconds]);

  /**
   * Bring the quote into view when it appears.
   *
   * It only ever appears because a press needs answering, so leaving it below
   * the fold turns a question into a dead button. Respects reduced-motion, and
   * `nearest` so a panel already on screen is not yanked around.
   */
  useEffect(() => {
    if (!videoQuote || !quoteRef.current) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    quoteRef.current.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [videoQuote]);

  /**
   * A 402 means "not enough credits". Instead of a toast that points at
   * Settings, show an inline panel with both ways to continue: a quick top-up
   * for this one render, or a monthly plan (better value per credit) for
   * regular use. Prices come from /api/credits, never hardcoded here.
   */
  const openCreditPanel = async (required: number, available: number) => {
    try {
      const response = await fetch("/api/credits", { cache: "no-store" });
      const data = response.ok ? await response.json() : {};
      setCreditPanel({
        required,
        available,
        topUps: Array.isArray(data.topUps) ? data.topUps : [],
        // Only paid plans belong here; Explorer is already free.
        plans: Array.isArray(data.plans)
          ? data.plans.filter(
              (plan: { monthlyPriceGhs: number }) => plan.monthlyPriceGhs > 0,
            )
          : [],
      });
    } catch {
      setCreditPanel({ required, available, topUps: [], plans: [] });
    }
  };

  /** Give up watching a render without touching the durable server job: the
   *  reservation TTL releases the hold automatically if the render never
   *  completes. The studio stays fully usable either way. */
  const stopWaitingForVideo = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollAttemptsRef.current = 0;
    pollNoticeShownRef.current = false;
    clearVideoJob();
    showToast(
      "Stopped checking on this render. If it never completes, your credits are released automatically.",
      false,
    );
  };

  const handleGenerateImage = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    // The waiting state belongs where the result will land, so a placeholder
    // card goes into the gallery straight away rather than a spinner in the
    // controls. Filters are reset first so the new card cannot land off-screen.
    setPendingImage({ prompt: prompt.trim(), aspectRatio: imageAspect });
    setGalleryFilter("all");
    setGalleryPage(1);
    setToastNotice("Making your visual… this takes a few seconds.");
    setToastError(false);
    try {
      const response = await fetch("/api/studio/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newRequestId("img"),
        },
        body: JSON.stringify({
          approved: true,
          prompt: prompt.trim(),
          style: look,
          intent: imageIntent(prompt.trim(), imageAspect),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) {
        if (response.status === 402) {
          await openCreditPanel(
            typeof data.required === "number" ? data.required : 3,
            typeof data.available === "number" ? data.available : 0,
          );
          showToast(
            "You need more credits to make this. Pick a top-up or a plan below.",
            true,
          );
          return;
        }
        throw new Error(mediaError(response.status, data));
      }

      const newItem: MediaItem = {
        id: typeof data.jobId === "string" ? data.jobId : newMediaId(),
        kind: "image",
        prompt: prompt.trim(),
        aspectRatio: imageAspect,
        styleName:
          IMAGE_LOOKS.find((entry) => entry.value === look)?.label || look,
        url: data.image,
        createdAt: "Just now",
        jobId: typeof data.jobId === "string" ? data.jobId : undefined,
      };
      setGallery((previous) => [newItem, ...previous]);
      setGalleryFilter("all");
      setGalleryPage(1);
      showToast("Your visual is ready — it is in your work below.", false);
      void loadCredits();
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "That visual could not be made. Please try again.",
        true,
      );
    } finally {
      setGenerating(false);
      setPendingImage(null);
    }
  };

  /** One quote request, raw — shared by the tier the person picked and the
   *  Draft alternative offered alongside it, so both are priced identically. */
  const fetchVideoQuote = async (
    intent: ReturnType<typeof videoIntent>,
  ): Promise<
    | { ok: true; quote: VideoQuote }
    | { ok: false; status: number; data: Record<string, unknown> }
  > => {
    const response = await fetch("/api/studio/video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": newRequestId("vid"),
      },
      body: JSON.stringify({ action: "quote", intent }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.costUsd !== "number") {
      return { ok: false, status: response.status, data };
    }
    return {
      ok: true,
      quote: {
        costUsd: data.costUsd,
        credits: data.credits || 16,
        model: data.model,
        intent: data.intent || intent,
      },
    };
  };

  /**
   * Price the shot and render it, in one gesture.
   *
   * This used to stop and ask. The Quality chips already carry the exact live
   * price for the options in front of the person, and the Render button repeats
   * it, so a confirm panel quoting that same number a third time was collecting
   * a decision that had already been made — and it was the step people bounced
   * off. The quote call itself stays, because the server binds `acceptedCostUsd`
   * and refuses to render without one; it just flows straight into the submit.
   *
   * The panel survives for the single case that genuinely needs a human: the
   * quote coming back at a price the button did not advertise. Nobody gets
   * charged a number they were not shown.
   */
  const startVideoRender = async (override?: {
    prompt?: string;
    tier?: string;
    aspect?: string;
    motion?: string;
    seconds?: number;
    expectedCredits?: number | null;
  }) => {
    const effectivePrompt = (override?.prompt ?? prompt).trim();
    const effectiveTier = override?.tier ?? videoTier;
    const effectiveAspect = override?.aspect ?? videoAspect;
    const effectiveMotion = override?.motion ?? cameraMotion;
    const effectiveSeconds = override?.seconds ?? videoSeconds;
    const expected = override?.expectedCredits ?? null;
    if (!effectivePrompt || generating || videoJob) return;
    setGenerating(true);
    setToastNotice("Starting your render…");
    setToastError(false);
    try {
      const main = await fetchVideoQuote(
        videoIntent(effectivePrompt, effectiveAspect, effectiveMotion, effectiveTier, effectiveSeconds),
      );
      if (!main.ok) {
        if (main.status === 402) {
          await openCreditPanel(
            typeof main.data.required === "number" ? main.data.required : 12,
            typeof main.data.available === "number" ? main.data.available : 0,
          );
          showToast(
            "You need more credits to render this video. Pick a top-up or a plan below.",
            true,
          );
          return;
        }
        throw new Error(
          mediaError(main.status, main.data) ||
            "Video pricing is unavailable right now.",
        );
      }

      /**
       * Straight through only when the quote matches the number the button
       * actually advertised. Two ways it can fail to: the catalogue price moved
       * while the shot was being set up, or the tier prices had not loaded yet
       * and the button went out unpriced. Either way nobody has been shown this
       * figure, so it goes to the panel to be accepted rather than charged.
       */
      if (expected === null || main.quote.credits !== expected) {
        setVideoQuote(main.quote);
        setToastNotice("");
        return;
      }

      setGenerating(false);
      await confirmVideoRender(main.quote, {
        continuing: true,
        // Rendering at the cheapest tier is the "try it first" move, so the
        // offer to re-run it sharper is attached here rather than sold up
        // front. This is what used to be the Draft button inside the confirm
        // panel — the same loop, without the extra decision before anything
        // has been seen.
        previewForTier:
          effectiveTier === "draft"
            ? { tier: "standard", motion: effectiveMotion, seconds: effectiveSeconds }
            : undefined,
      });
      return;
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "Video pricing is unavailable.",
        true,
      );
    } finally {
      setGenerating(false);
    }
  };

  const confirmVideoRender = async (
    quote: VideoQuote,
    options?: {
      previewForTier?: { tier: string; motion: string; seconds: number };
      /**
       * Set when `startVideoRender` hands straight over. Its own
       * `setGenerating(false)` has not been applied to this closure yet, so the
       * busy guard below would otherwise read a stale `true` and drop the
       * render on the floor.
       */
      continuing?: boolean;
    },
  ) => {
    const previewForTier = options?.previewForTier;
    if (generating && !options?.continuing) return;
    /**
     * The quote panel deliberately stays up until the submit comes back.
     *
     * Clearing it here removed the block the person was reading and looking at
     * the moment they pressed it, so the page collapsed upward and the eye
     * landed back on the composer — indistinguishable from the button having
     * done nothing. It now holds its place and shows its own progress, and is
     * dismissed only once there is a job to replace it.
     */
    setSharpenOffer(null);
    setGenerating(true);
    setToastNotice("Starting your render…");
    setToastError(false);
    try {
      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newRequestId("vid"),
        },
        body: JSON.stringify({
          action: "submit",
          approved: true,
          acceptedCostUsd: quote.costUsd,
          intent: quote.intent,
          prompt: prompt.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        if (response.status === 402) {
          // Keep the quote on screen so the render can be confirmed again the
          // moment the balance is topped up, without re-pricing it.
          setVideoQuote(quote);
          await openCreditPanel(
            typeof data.required === "number" ? data.required : quote.credits,
            typeof data.available === "number" ? data.available : 0,
          );
          showToast(
            "You need more credits to render this video. Pick a top-up or a plan below.",
            true,
          );
          return;
        }
        throw new Error(
          mediaError(response.status, data) ||
            "The video could not be started.",
        );
      }
      // There is a real job now, so the quote it came from can go.
      setVideoQuote(null);
      const job: VideoJob = {
        token: data.token,
        jobId: data.jobId,
        status: data.status || "pending",
        prompt: prompt.trim(),
        // Was hardcoded to "4s", so every 6s and 8s clip was filed under the
        // wrong length in the gallery.
        duration: `${
          (quote.intent as { durationSeconds?: number }).durationSeconds ??
          videoSeconds
        }s`,
        aspectRatio: videoAspect,
        previewForTier,
      };
      persistVideoJob(job);
      // The render now has a placeholder card in the gallery; make sure the
      // active filter cannot hide it.
      setGalleryFilter("all");
      setGalleryPage(1);
      setToastNotice("");
      scheduleVideoPoll(job, 20_000);
      void loadCredits();
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "The video could not be started.",
        true,
      );
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Re-run the exact shot a Quick render just proved out, one tier up. Syncs
   * the composer to match what is being priced, rather than trusting the person
   * has not touched anything since.
   */
  const sharpenCredits = (tier: string) => {
    // Same rule as the tier chips: a price that was quoted for another format
    // is no price at all, and an unpriced Sharpen goes through the quote panel.
    if (tierPriceKey !== `${videoAspect}|${videoSeconds}`) return null;
    const price = tierPrices.find((entry) => entry.tier === tier);
    return price?.available && typeof price.credits === "number" ? price.credits : null;
  };

  const confirmSharpen = () => {
    if (!sharpenOffer || generating) return;
    const { tier, prompt: offerPrompt, aspectRatio, motion, seconds } = sharpenOffer;
    setPrompt(offerPrompt);
    setVideoTier(tier);
    setVideoAspect(aspectRatio);
    setCameraMotion(motion);
    setVideoSeconds(seconds);
    setSharpenOffer(null);
    // The sharpen button carries its own price, so that is the number the
    // render is held to — not the composer's tier, which has only just been
    // changed and whose state update has not landed in this closure yet.
    void startVideoRender({
      prompt: offerPrompt,
      tier,
      aspect: aspectRatio,
      motion,
      seconds,
      expectedCredits: sharpenCredits(tier),
    });
  };

  const pollVideo = async (job: VideoJob) => {
    try {
      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          token: job.token,
          jobId: job.jobId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The server can mark a job terminal inside an error response (for
        // example when the provider lost the job, or a finished clip could not
        // be saved) — the hold has already been returned in those cases.
        if (
          data.status === "failed" ||
          data.status === "cancelled" ||
          data.status === "expired"
        ) {
          clearVideoJob();
          showToast(
            data.error ||
              "This video job is no longer available. Your credits were returned.",
            true,
          );
          void loadCredits();
          return;
        }
        // A 5xx is transient (provider hiccup, delivery retry) — back off and
        // keep the job. A 4xx means the job itself is gone, which is terminal.
        if (response.status >= 500) {
          pollAttemptsRef.current += 1;
          if (pollAttemptsRef.current > MAX_CONSECUTIVE_ERRORS) {
            // A long outage must neither strand the render nor lock the
            // studio: keep polling slowly in the background and say so once.
            if (!pollNoticeShownRef.current) {
              pollNoticeShownRef.current = true;
              const providerNote =
                typeof data.providerMessage === "string"
                  ? ` (${data.providerMessage.slice(0, 140)})`
                  : "";
              showToast(
                `The video service is having trouble${providerNote}. We will keep retrying in the background — your credits are safe and the clip will appear here when it is ready.`,
                true,
              );
            }
            scheduleVideoPoll(job, SLOW_RETRY_MS);
            return;
          }
          scheduleVideoPoll(job, pollBackoff(pollAttemptsRef.current));
          return;
        }
        clearVideoJob();
        showToast(
          data.error ||
            "This video job is no longer available. Your credits were returned.",
          true,
        );
        void loadCredits();
        return;
      }

      pollAttemptsRef.current = 0;
      pollNoticeShownRef.current = false;
      const status = data.status || "pending";
      if (status === "completed" && data.downloadUrl) {
        const newItem: MediaItem = {
          id:
            typeof data.jobId === "string"
              ? data.jobId
              : job.jobId || newMediaId(),
          kind: "video",
          prompt: job.prompt,
          aspectRatio: job.aspectRatio || "16:9",
          styleName: `${job.duration} clip`,
          url: data.downloadUrl,
          createdAt: "Just now",
          jobId:
            typeof data.jobId === "string" ? data.jobId : job.jobId,
        };
        setGallery((previous) => [newItem, ...previous]);
        clearVideoJob();
        setGalleryFilter("all");
        setGalleryPage(1);
        // A Draft taken instead of the tier actually picked: offer to redo
        // it at that tier now that the direction has been seen, not guessed at.
        if (job.previewForTier) {
          setSharpenOffer({
            tier: job.previewForTier.tier,
            prompt: job.prompt,
            aspectRatio: job.aspectRatio || "16:9",
            motion: job.previewForTier.motion,
            seconds: job.previewForTier.seconds,
          });
          showToast(
            "Your draft is ready — it is in your work below.",
            false,
          );
        } else {
          showToast("Your video is ready — it is in your work below.", false);
        }
        void loadCredits();
        return;
      }
      // failed, cancelled and expired are all terminal: the server already
      // refunded the hold, so tell the person rather than polling forever.
      if (
        status === "failed" ||
        status === "cancelled" ||
        status === "expired"
      ) {
        clearVideoJob();
        showToast(
          data.error || "The video render failed. Your credits were returned.",
          true,
        );
        void loadCredits();
        return;
      }
      const next = { ...job, jobId: data.jobId || job.jobId, status };
      persistVideoJob(next);
      scheduleVideoPoll(next, 20_000);
    } catch {
      // Network failure (offline, timeout): keep the job and retry with backoff.
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > MAX_CONSECUTIVE_ERRORS) {
        if (!pollNoticeShownRef.current) {
          pollNoticeShownRef.current = true;
          showToast(
            "We lost contact with the video service. We will keep retrying in the background — your credits are safe and the clip will appear here when it is ready.",
            true,
          );
        }
        scheduleVideoPoll(job, SLOW_RETRY_MS);
        return;
      }
      scheduleVideoPoll(job, pollBackoff(pollAttemptsRef.current));
    }
  };

  /**
   * The current scheduler, reachable from the mount-only effect below.
   *
   * `scheduleVideoPoll` closes over most of the component, so it is a new
   * function every render. Listing it as a dependency would tear down and
   * re-register the visibility listener — and re-fire a poll — on every single
   * render, so the effect reads it through a ref that is kept current here
   * instead. Declared before that effect so it is already up to date when the
   * mount pass runs.
   */
  const scheduleVideoPollRef = useRef(scheduleVideoPoll);
  useEffect(() => {
    scheduleVideoPollRef.current = scheduleVideoPoll;
  });

  // Resume a render that was in flight when the page refreshed or the tab was
  // closed, and poll immediately when the tab becomes visible again (mobile
  // browsers throttle timers in background tabs). The job itself is recovered
  // by the state initializer, so there is nothing to set here — only the
  // polling to restart.
  useEffect(() => {
    if (videoJobRef.current) {
      scheduleVideoPollRef.current(videoJobRef.current, 0);
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible" && videoJobRef.current) {
        scheduleVideoPollRef.current(videoJobRef.current, 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollTimerRef.current !== null)
        window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  // The gallery is the person's real media, not just this session. Load the
  // most recent completed jobs — including clips that finished while the
  // studio was closed — so generated work survives a refresh. Examples stay
  // behind real work as inspiration.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/studio/media?recent=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { jobs?: RecentMediaJob[] } | null) => {
        if (cancelled || !data?.jobs?.length) return;
        const items: MediaItem[] = data.jobs
          .filter(
            (job) => typeof job.outputAssetId === "string" && job.outputAssetId,
          )
          .map((job) => ({
            id: job.id,
            kind: job.mediaType === "video" ? "video" : "image",
            prompt:
              typeof job.intent?.purpose === "string" && job.intent.purpose
                ? job.intent.purpose
                : "Generated asset",
            aspectRatio:
              typeof job.intent?.aspectRatio === "string"
                ? job.intent.aspectRatio
                : "16:9",
            styleName:
              typeof job.model === "string" && job.model
                ? job.model.split("/").pop() || job.model
                : "AI generated",
            url: `/api/studio/media?assetId=${encodeURIComponent(job.outputAssetId as string)}`,
            createdAt:
              typeof job.createdAt === "string"
                ? new Date(job.createdAt).toLocaleDateString()
                : "Recent",
            jobId: job.id,
          }));
        setGallery((previous) => {
          const existingIds = new Set(
            previous.filter((item) => !item.example).map((item) => item.id),
          );
          return [
            ...items.filter((item) => !existingIds.has(item.id)),
            ...previous,
          ];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isVideo = mode === "video";
  const starters = isVideo ? VIDEO_STARTERS : IMAGE_STARTERS;
  const formats = isVideo ? VIDEO_FORMATS : IMAGE_FORMATS;
  const activeAspect = isVideo ? videoAspect : imageAspect;
  const setActiveAspect = isVideo ? setVideoAspect : setImageAspect;
  /**
   * The exact price of the options currently selected, straight from the
   * catalogue. This is the number printed on the Render button and the one the
   * quote is checked against before anything is charged — so what the button
   * says and what the render costs are the same fact, not two guesses at it.
   *
   * Null while the tier prices are still loading, or when the selection cannot
   * be bought at all; the button falls back to an unpriced label and the drift
   * check is skipped rather than compared against nothing.
   */
  const videoFormatKey = `${videoAspect}|${videoSeconds}`;
  /** Prices are only usable while they still describe what is selected. */
  const pricesMatchSelection = tierPriceKey === videoFormatKey;
  const selectedTierPrice = pricesMatchSelection
    ? tierPrices.find((entry) => entry.tier === videoTier)
    : undefined;
  const shownVideoCredits =
    selectedTierPrice?.available && typeof selectedTierPrice.credits === "number"
      ? selectedTierPrice.credits
      : null;
  const mine = gallery.filter((item) => !item.example);
  const visible = gallery.filter(
    (item) => galleryFilter === "all" || item.kind === galleryFilter,
  );
  const canGenerate =
    Boolean(prompt.trim()) &&
    !generating &&
    !(isVideo && (Boolean(videoJob) || Boolean(videoQuote)));

  /**
   * The work in flight, drawn as a card at the head of the gallery. Video reads
   * from the durable job rather than a second copy of the same facts, so a
   * refresh during a render still shows the placeholder in the right place.
   */
  const pending = pendingImage
    ? {
        kind: "image" as MediaKind,
        prompt: pendingImage.prompt,
        aspectRatio: pendingImage.aspectRatio,
        label: "Making your image…",
      }
    : videoJob
      ? {
          kind: "video" as MediaKind,
          prompt: videoJob.prompt,
          aspectRatio: videoJob.aspectRatio || "16:9",
          label: "Rendering your video…",
        }
      : null;
  const pendingVisible =
    pending && (galleryFilter === "all" || galleryFilter === pending.kind);
  const galleryItemCount = visible.length + (pendingVisible ? 1 : 0);
  const galleryPageCount = Math.max(
    1,
    Math.ceil(galleryItemCount / GALLERY_PAGE_SIZE),
  );
  // A filter can make the current page disappear. Clamp in render rather than
  // repairing state in an effect, which would briefly draw an empty shelf.
  const currentGalleryPage = Math.min(galleryPage, galleryPageCount);
  const pendingSlot = pendingVisible ? 1 : 0;
  const pageGalleryStart = Math.max(
    0,
    (currentGalleryPage - 1) * GALLERY_PAGE_SIZE - pendingSlot,
  );
  const pageGallerySlots =
    GALLERY_PAGE_SIZE - (currentGalleryPage === 1 ? pendingSlot : 0);
  const pageItems = visible.slice(
    pageGalleryStart,
    pageGalleryStart + pageGallerySlots,
  );
  const pageRangeStart = galleryItemCount
    ? (currentGalleryPage - 1) * GALLERY_PAGE_SIZE + 1
    : 0;
  const pageRangeEnd = Math.min(
    currentGalleryPage * GALLERY_PAGE_SIZE,
    galleryItemCount,
  );

  const changeGalleryPage = (nextPage: number) => {
    const page = Math.min(Math.max(nextPage, 1), galleryPageCount);
    if (page === currentGalleryPage) return;
    setGalleryPage(page);
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  };

  /**
   * What the collapsed dock says about the current settings. Folding the
   * controls away must not hide what they are set to, so every one of them is
   * named here.
   */
  const formatLabel =
    formats.find((entry) => entry.ratio === activeAspect)?.label || activeAspect;
  const settingsSummary = isVideo
    ? [
        formatLabel,
        `${videoSeconds}s`,
        VIDEO_TIERS.find((tier) => tier.value === videoTier)?.label,
        VIDEO_MOTIONS.find((motion) => motion.value === cameraMotion)?.label,
      ]
        .filter(Boolean)
        .join(" · ")
    : [formatLabel, IMAGE_LOOKS.find((entry) => entry.value === look)?.label]
        .filter(Boolean)
        .join(" · ");

  /**
   * Reuse the prompt behind any card — including the shipped examples, which is
   * what makes them templates rather than decoration. The shape and mode follow
   * the card, so pressing this reproduces the same kind of work.
   */
  const reusePrompt = (item: MediaItem) => {
    setPrompt(item.prompt);
    setMode(item.kind);
    const allowed = item.kind === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;
    if (allowed.some((entry) => entry.ratio === item.aspectRatio)) {
      if (item.kind === "video") setVideoAspect(item.aspectRatio);
      else setImageAspect(item.aspectRatio);
    }
    promptRef.current?.focus();
  };

  const deleteMedia = async (item: MediaItem) => {
    setMediaDeleteBusy(true);
    setMediaDeleteError("");
    if (item.jobId) {
      try {
        const response = await fetch("/api/studio/media", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: item.jobId }),
        });
        const data = await response.json().catch(() => ({}));
        // A stale card whose server record is already gone should still leave
        // the gallery clean instead of becoming impossible to dismiss.
        if (!response.ok && response.status !== 404) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "This media item could not be deleted.",
          );
        }
      } catch (cause) {
        setMediaDeleteError(
          cause instanceof Error
            ? cause.message
            : "This media item could not be deleted.",
        );
        setMediaDeleteBusy(false);
        return;
      }
    }

    setGallery((current) => current.filter((entry) => entry.id !== item.id));
    setMediaToDelete(null);
    setMediaDeleteBusy(false);
    showToast(`${item.kind === "video" ? "Video" : "Image"} deleted.`, false);
  };

  /** Ctrl/⌘+Enter starts the work without reaching for the button. */
  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (!canGenerate) return;
    void (isVideo
      ? startVideoRender({ expectedCredits: shownVideoCredits })
      : handleGenerateImage());
  };

  /** Complete the tab pattern for people navigating without a pointer. */
  const onModeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMode: MediaKind = event.key === "ArrowRight" || event.key === "End"
      ? "video"
      : "image";
    setMode(nextMode);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextMode === "image" ? 0 : 1]?.focus();
  };

  return (
    <div className="media-studio">
      {mediaToDelete ? (
        <DeleteConfirmationDialog
          title={`Delete this ${mediaToDelete.kind}?`}
          description={mediaToDelete.jobId
            ? `This permanently removes the ${mediaToDelete.kind} and its saved file. This cannot be undone.`
            : `This removes the ${mediaToDelete.kind} from this gallery. This cannot be undone.`}
          confirmLabel={`Delete ${mediaToDelete.kind}`}
          busy={mediaDeleteBusy}
          error={mediaDeleteError}
          onClose={() => {
            if (mediaDeleteBusy) return;
            setMediaToDelete(null);
            setMediaDeleteError("");
          }}
          onConfirm={() => void deleteMedia(mediaToDelete)}
        />
      ) : null}
      {toastNotice ? (
        <div
          className={`ms-toast${toastError ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toastNotice}
        </div>
      ) : null}

      {creditPanel ? (
        <section className="ms-credit-panel">
          <div className="ms-credit-head">
            <div>
              <b>
                You need {creditPanel.required} credit
                {creditPanel.required === 1 ? "" : "s"} to continue
              </b>
              <small>
                You have {creditPanel.available} available. Pick a quick top-up
                for this one, or a monthly plan if you use AI360 regularly.
              </small>
            </div>
            <button
              type="button"
              className="ms-credit-close"
              onClick={() => setCreditPanel(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>

          {creditPanel.topUps.length ? (
            <div className="ms-credit-section">
              <span className="ms-credit-label">
                Quick top-up — never expires, never renews
              </span>
              <div className="ms-credit-grid">
                {creditPanel.topUps.map((topUp) => (
                  <a
                    key={topUp.slug}
                    href={`/checkout?topup=${topUp.slug}`}
                    className="ms-credit-card"
                  >
                    <b>{topUp.credits} credits</b>
                    <small>GH₵{topUp.priceGhs}</small>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {creditPanel.plans.length ? (
            <div className="ms-credit-section">
              <span className="ms-credit-label">
                Monthly plan — better value per credit
              </span>
              <div className="ms-credit-grid">
                {creditPanel.plans.map((plan) => (
                  <a
                    key={plan.slug}
                    href={`/checkout?plan=${plan.slug}`}
                    className={`ms-credit-card${plan.featured ? " is-featured" : ""}`}
                  >
                    <b>{plan.name}</b>
                    <small>
                      GH₵{plan.monthlyPriceGhs}/mo · {plan.includedCredits}{" "}
                      credits
                    </small>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* The gallery follows the creation panel visually. Keeping it in the DOM
          before the controls preserves the established generation code while
          CSS gives the primary task the correct first position. */}
      <div className="ms-stage" id="media-studio-workspace">
        <section className="ms-results" aria-label="Your work" ref={resultsRef}>
          <div className="ms-results-head">
            <h2>
              {mine.length ? "Your work" : "Made in this studio"}
              <span className="ms-count">
                {visible.length}
                <span className="ms-sr-only"> items shown</span>
              </span>
            </h2>
            <div className="ms-filters" role="group" aria-label="Filter">
              {(["all", "image", "video"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={galleryFilter === value}
                  className={galleryFilter === value ? "is-active" : ""}
                  onClick={() => {
                    setGalleryFilter(value);
                    setGalleryPage(1);
                  }}
                >
                  {value === "all"
                    ? "All"
                    : value === "image"
                      ? "Images"
                      : "Videos"}
                </button>
              ))}
            </div>
          </div>

          {visible.length || pendingVisible ? (
            <div className="ms-grid">
              {/* Work in flight takes its place in the gallery immediately, so
                  the waiting happens where the result will appear rather than
                  in the controls. */}
              {pendingVisible && pending ? (
                <article className="ms-card is-pending" aria-live="polite">
                  <div
                    className="ms-card-media"
                    data-ratio={pending.aspectRatio}
                  >
                    <div className="ms-pending-fill">
                      <span className="ms-spinner" aria-hidden="true" />
                    </div>
                    <span className="ms-card-tag">
                      <StudioIcon name={pending.kind} />
                      {pending.aspectRatio}
                    </span>
                  </div>
                  <div className="ms-card-body">
                    <p>{pending.prompt}</p>
                    <div className="ms-card-foot">
                      <span className="ms-card-meta">{pending.label}</span>
                      {pending.kind === "video" ? (
                        <button
                          type="button"
                          className="ms-card-action"
                          onClick={stopWaitingForVideo}
                        >
                          Stop waiting
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ) : null}
              {pageItems.map((item, index) => (
                <article
                  className={`ms-card${item.example ? " is-example" : ""}`}
                  key={item.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }}
                >
                  <div
                    className="ms-card-media"
                    data-ratio={item.aspectRatio}
                  >
                    {item.kind === "video" ? (
                      <video
                        src={item.url}
                        poster={item.poster}
                        controls
                        muted
                        loop
                        playsInline
                        preload={dataSaver ? "none" : "metadata"}
                        autoPlay={!dataSaver && item.example}
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.url} alt={item.prompt} loading="lazy" />
                    )}
                    <span className="ms-card-tag">
                      <StudioIcon
                        name={item.kind === "video" ? "video" : "image"}
                      />
                      {item.example ? "Example" : item.aspectRatio}
                    </span>
                    {!item.example ? (
                      <button
                        type="button"
                        className="ms-delete-button"
                        aria-label={`Delete this ${item.kind}`}
                        title={`Delete ${item.kind}`}
                        onClick={() => {
                          setMediaDeleteError("");
                          setMediaToDelete(item);
                        }}
                      >
                        <StudioIcon name="trash" />
                      </button>
                    ) : null}
                  </div>
                  <div className="ms-card-body">
                    <p>{item.prompt}</p>
                    <div className="ms-card-foot">
                      <span className="ms-card-meta">
                        {item.styleName} · {item.createdAt}
                      </span>
                      <div className="ms-card-actions">
                        {/* Showing the prompt behind a result — the shipped
                            examples included — is what turns the gallery into
                            a set of starting points instead of decoration. */}
                        <button
                          type="button"
                          className="ms-card-action"
                          onClick={() => reusePrompt(item)}
                          title="Put this prompt in the composer"
                        >
                          <StudioIcon name="reuse" />
                          <span>Use this prompt</span>
                        </button>
                        {!item.example ? (
                          <a
                            href={item.url}
                            download={`ai360-${item.kind}-${item.id}.${item.kind === "video" ? "mp4" : "png"}`}
                            className="ms-download"
                          >
                            <StudioIcon name="download" />
                            <span>Save</span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="ms-empty">
              Nothing here yet. Write a sentence below and make your first one.
            </p>
          )}

          {galleryItemCount > GALLERY_PAGE_SIZE ? (
            <nav className="ms-pagination" aria-label="Gallery pages">
              <div className="ms-page-status" aria-live="polite">
                <span className="ms-page-range">
                  {pageRangeStart}–{pageRangeEnd}
                  <small> of {galleryItemCount}</small>
                </span>
                <span className="ms-page-name">
                  Shelf {String(currentGalleryPage).padStart(2, "0")} /{" "}
                  {String(galleryPageCount).padStart(2, "0")}
                </span>
              </div>
              <div className="ms-page-controls">
                <button
                  type="button"
                  className="ms-page-arrow"
                  onClick={() => changeGalleryPage(currentGalleryPage - 1)}
                  disabled={currentGalleryPage === 1}
                  aria-label="Previous gallery page"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <div
                  className="ms-page-track"
                  aria-label="Choose a gallery page"
                >
                  {Array.from({ length: galleryPageCount }, (_, index) => {
                    const page = index + 1;
                    return (
                      <button
                        type="button"
                        key={page}
                        className={
                          page === currentGalleryPage ? "is-active" : ""
                        }
                        onClick={() => changeGalleryPage(page)}
                        aria-label={`Gallery page ${page}`}
                        aria-current={
                          page === currentGalleryPage ? "page" : undefined
                        }
                      >
                        <span>{String(page).padStart(2, "0")}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="ms-page-arrow"
                  onClick={() => changeGalleryPage(currentGalleryPage + 1)}
                  disabled={currentGalleryPage === galleryPageCount}
                  aria-label="Next gallery page"
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </nav>
          ) : null}
        </section>
      </div>

      {/* A creation workspace, not a one-line dock. The page-level header above
          already names Media Studio, so this panel starts with the task and the
          Image / Video choice instead of repeating a second page title. */}
      <div className="ms-dock">
        <div className="ms-dock-extras">
          {optionsOpen ? (
            <div className="ms-dock-panel" id="ms-options">
              <div className="ms-control">
                <span className="ms-control-label">Shape</span>
                <div className="ms-chips" role="group" aria-label="Shape">
                  {formats.map((item) => (
                    <button
                      key={item.ratio}
                      type="button"
                      aria-pressed={activeAspect === item.ratio}
                      className={`ms-chip${activeAspect === item.ratio ? " is-active" : ""}`}
                      onClick={() => setActiveAspect(item.ratio)}
                    >
                      <b>{item.label}</b>
                      <small>{item.use}</small>
                    </button>
                  ))}
                </div>
              </div>

              {isVideo ? (
                <>
                  <div className="ms-control">
                    <span className="ms-control-label">Length</span>
                    <div
                      className="ms-chips is-compact"
                      role="group"
                      aria-label="Length"
                    >
                      {VIDEO_LENGTHS.map((seconds) => (
                        <button
                          key={seconds}
                          type="button"
                          aria-pressed={videoSeconds === seconds}
                          className={`ms-chip${videoSeconds === seconds ? " is-active" : ""}`}
                          onClick={() => setVideoSeconds(seconds)}
                        >
                          <b>{seconds}s</b>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ms-control">
                    <span className="ms-control-label">Quality</span>
                    <div className="ms-chips" role="group" aria-label="Quality">
                      {VIDEO_TIERS.map((tier) => {
                        // Only prices quoted for the shape and length currently
                        // selected. A price from a previous format is not a
                        // cheaper option, it is a wrong number.
                        const price = pricesMatchSelection
                          ? tierPrices.find(
                              (entry) => entry.tier === tier.value,
                            )
                          : undefined;
                        // An option nobody can buy is disabled and says why,
                        // rather than failing at the moment of confirming.
                        const unavailable = price ? !price.available : false;
                        return (
                          <button
                            key={tier.value}
                            type="button"
                            aria-pressed={videoTier === tier.value}
                            disabled={unavailable}
                            className={`ms-chip ms-tier${videoTier === tier.value ? " is-active" : ""}${unavailable ? " is-unavailable" : ""}`}
                            onClick={() => setVideoTier(tier.value)}
                          >
                            <b>{tier.label}</b>
                            {price?.available && price.credits ? (
                              <span className="ms-tier-price">
                                {price.credits} credits
                              </span>
                            ) : null}
                            <small>
                              {unavailable
                                ? "Not available for this shape or length."
                                : price?.model
                                  ? engineName(price.model)
                                  : tier.note}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="ms-control">
                    <span className="ms-control-label">Camera</span>
                    <div
                      className="ms-chips is-compact"
                      role="group"
                      aria-label="Camera"
                    >
                      {VIDEO_MOTIONS.map((motion) => (
                        <button
                          key={motion.value}
                          type="button"
                          aria-pressed={cameraMotion === motion.value}
                          className={`ms-chip${cameraMotion === motion.value ? " is-active" : ""}`}
                          onClick={() => setCameraMotion(motion.value)}
                        >
                          <b>{motion.label}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="ms-control">
                  <span className="ms-control-label">Look</span>
                  <div
                    className="ms-chips is-compact"
                    role="group"
                    aria-label="Look"
                  >
                    {IMAGE_LOOKS.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        aria-pressed={look === entry.value}
                        className={`ms-chip${look === entry.value ? " is-active" : ""}`}
                        onClick={() => setLook(entry.value)}
                      >
                        <b>{entry.label}</b>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Not a routine step any more. A render goes straight through on one
              press whenever the quote matches the price on the button. This
              appears only when it does not — the catalogue moved, or the prices
              had not loaded and the button went out unpriced — or when a render
              stopped for want of credits and can be resumed once topped up. */}
          {videoQuote ? (
            <div className="ms-quote is-live" role="status" ref={quoteRef}>
              <div>
                <b>
                  {shownVideoCredits !== null &&
                  videoQuote.credits !== shownVideoCredits
                    ? `This one costs ${videoQuote.credits} credits, not ${shownVideoCredits}`
                    : `This one costs ${videoQuote.credits} credits`}
                </b>
                <small>
                  {generating
                    ? "Starting your render…"
                    : `${videoSeconds}s · ${videoAspect} · ${
                        VIDEO_TIERS.find((tier) => tier.value === videoTier)
                          ?.label || videoTier
                      }. You are only charged if it works — a failed render returns your credits.`}
                </small>
              </div>
              <div className="ms-quote-actions">
                <button
                  type="button"
                  className="ms-ghost-btn"
                  onClick={() => setVideoQuote(null)}
                  disabled={generating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ms-confirm-btn"
                  // `continuing` because this press is the decision itself: the
                  // busy guard must never silently swallow it.
                  onClick={() =>
                    confirmVideoRender(videoQuote, { continuing: true })
                  }
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <span className="ms-spinner" aria-hidden="true" />
                      Starting…
                    </>
                  ) : (
                    `Render it · ${videoQuote.credits} credits`
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {sharpenOffer && !videoQuote ? (
            <div className="ms-quote ms-sharpen" role="status">
              <div>
                <b>Like this direction?</b>
                <small>
                  That was a quick draft. Get the same shot in{" "}
                  {VIDEO_TIERS.find((tier) => tier.value === sharpenOffer.tier)?.label || "better"}{" "}
                  quality.
                </small>
              </div>
              <div className="ms-quote-actions">
                <button
                  type="button"
                  className="ms-ghost-btn"
                  onClick={() => setSharpenOffer(null)}
                  disabled={generating}
                >
                  Dismiss
                </button>
                {/* Priced, because pressing it now renders straight away
                    rather than opening a quote to disclose the cost in. */}
                <button
                  type="button"
                  className="ms-confirm-btn"
                  onClick={confirmSharpen}
                  disabled={generating}
                >
                  {(() => {
                    const price = sharpenCredits(sharpenOffer.tier);
                    return price !== null ? `Sharpen it · ${price} credits` : "Sharpen it";
                  })()}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ms-bar">
          <div className="ms-compose-head">
            <div>
              <span className="ms-compose-kicker">Create</span>
              <h1>{isVideo ? "Describe your video" : "Describe your image"}</h1>
              <p>
                {isVideo
                  ? "Set the scene, action, camera movement and mood."
                  : "Include the subject, setting, style and any text placement."}
              </p>
            </div>
            <div
              className="ms-mode"
              role="tablist"
              aria-label="What do you want to make?"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isVideo}
                aria-controls="media-studio-workspace"
                tabIndex={!isVideo ? 0 : -1}
                className={!isVideo ? "is-active" : ""}
                onClick={() => setMode("image")}
                onKeyDown={onModeKeyDown}
              >
                <StudioIcon name="image" />
                <span>Image</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isVideo}
                aria-controls="media-studio-workspace"
                tabIndex={isVideo ? 0 : -1}
                className={isVideo ? "is-active" : ""}
                onClick={() => setMode("video")}
                onKeyDown={onModeKeyDown}
              >
                <StudioIcon name="video" />
                <span>Video</span>
              </button>
            </div>
          </div>

          {/* Starting points sit right at the prompt while it is empty, then
              get out of the way — the blank-page problem is only a problem
              before there is something written. */}
          {!prompt.trim() ? (
            <div className="ms-starters" aria-label="Starting points">
              {starters.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="ms-starter"
                  onClick={() => setPrompt(item.text)}
                >
                  <StudioIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <label className="ms-sr-only" htmlFor="ms-prompt">
            {isVideo ? "Describe the shot" : "Describe the picture"}
          </label>
          <textarea
            id="ms-prompt"
            ref={promptRef}
            className="ms-prompt"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={onPromptKeyDown}
            placeholder={
              isVideo
                ? "Slow pan across colourful wax print fabric at a market stall, warm daylight…"
                : "A jar of shea butter on a wooden market table, warm morning light, space at the top for a headline…"
            }
          />

          <div className="ms-bar-row">
            <button
              type="button"
              className={`ms-options-toggle${optionsOpen ? " is-open" : ""}`}
              onClick={() => setOptionsOpen((open) => !open)}
              aria-expanded={optionsOpen}
              aria-controls="ms-options"
            >
              <StudioIcon name="sliders" />
              <span className="ms-options-summary">{settingsSummary}</span>
              <StudioIcon name="chevron" />
            </button>

            {prompt ? (
              <button
                type="button"
                className="ms-clear"
                onClick={() => setPrompt("")}
              >
                Clear
              </button>
            ) : null}

            {/* Deliberately not a price range. A span like "6–48 credits"
                anchors people to its bottom number and then reads as a bait
                when the thing they actually asked for lands near the top. The
                only number worth showing is the real one for the options in
                front of them: on video that is on the Render button, and on
                image it arrives with the result. */}
            <p className="ms-cost-note">Charged only when the work succeeds</p>

            <button
              type="button"
              className={`ms-generate${generating ? " is-busy" : ""}`}
              onClick={() =>
                void (isVideo
                  ? startVideoRender({ expectedCredits: shownVideoCredits })
                  : handleGenerateImage())
              }
              disabled={!canGenerate}
            >
              <StudioIcon name="spark" />
              {/* Both labels ship; CSS picks the one the width can hold, so a
                  phone never gets the priced label squeezed into a chip.

                  The price rides on the button because this press is now the
                  whole confirmation — there is no second panel behind it in
                  which to disclose a number. When the catalogue has not
                  answered yet, the label goes back to being unpriced rather
                  than inventing a figure. */}
              <span className="ms-generate-long">
                {generating
                  ? isVideo
                    ? "Starting…"
                    : "Making it…"
                  : isVideo
                    ? videoJob
                      ? "Rendering…"
                      : shownVideoCredits !== null
                        ? `Render · ${shownVideoCredits} credits`
                        : "Render this video"
                    : "Make the image"}
              </span>
              <span className="ms-generate-short">
                {generating
                  ? isVideo
                    ? "Starting…"
                    : "Making…"
                  : isVideo
                    ? videoJob
                      ? "Rendering…"
                      : shownVideoCredits !== null
                        ? `Render · ${shownVideoCredits}`
                        : "Render"
                    : "Make image"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
