"use client";

import { useEffect, useRef, useState } from "react";
import { notifyCreditsChanged } from "@/components/CreditBalance";

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
  /** Examples ship with the studio; real work is the person's own. */
  example?: boolean;
};

/**
 * Examples are inspiration, never work. They sit behind the person's own
 * output and are labelled, so nothing here can be mistaken for something the
 * studio produced for them.
 */
const EXAMPLE_GALLERY: MediaItem[] = [
  {
    id: "example-motion",
    kind: "video",
    prompt:
      "Warm light ribbons drifting across a dark backdrop — a brand motion loop made from one sentence.",
    aspectRatio: "16:9",
    styleName: "Motion loop",
    url: "/studio-hero-loop.mp4",
    poster: "/studio-creative.png",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-portrait",
    kind: "image",
    prompt:
      "Cinematic portrait of a founder at a desk in a high-rise Accra office at golden hour.",
    aspectRatio: "16:9",
    styleName: "Cinematic photoreal",
    url: "/studio-hero.png",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-product",
    kind: "image",
    prompt:
      "Hibiscus and ginger tea packaging on cream marble, soft studio sunlight, gold foil detail.",
    aspectRatio: "1:1",
    styleName: "Product studio",
    url: "/studio-product.png",
    createdAt: "Example",
    example: true,
  },
  {
    id: "example-texture",
    kind: "image",
    prompt:
      "Flowing golden light ribbons over matte charcoal — a premium brand texture.",
    aspectRatio: "16:9",
    styleName: "3D render",
    url: "/studio-creative.png",
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
 * Two honest video tiers. The catalogue also has a premium engine, but at
 * today's prices it costs more than a single render is allowed to charge, so
 * offering it would only produce a refusal at the moment of confirming.
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

/** What each kind of work costs, read from the server so nothing is hardcoded. */
type CreditFacts = {
  available: number | null;
  image: { from: number; to: number } | null;
  video: { from: number; to: number } | null;
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
  const [galleryFilter, setGalleryFilter] = useState<"all" | MediaKind>("all");
  const [toastNotice, setToastNotice] = useState("");
  const [toastError, setToastError] = useState(false);
  const [videoQuote, setVideoQuote] = useState<VideoQuote | null>(null);
  /**
   * A render still in flight, read straight from session storage as the initial
   * value rather than written in after mount. The studio only ever renders once
   * the workspace has hydrated on the client, so there is no server pass to
   * disagree with — and reading here means no extra render just to recover a
   * job the browser already knew about.
   */
  const [videoJob, setVideoJob] = useState<VideoJob | null>(readStoredVideoJob);
  const [creditPanel, setCreditPanel] = useState<CreditPanelState | null>(null);
  const [credits, setCredits] = useState<CreditFacts>({
    available: null,
    image: null,
    video: null,
  });
  const [tierPrices, setTierPrices] = useState<TierPrice[]>([]);
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
   * The balance and the real cost of each kind of work, straight from the
   * server — so the studio never has to hardcode a price that could drift from
   * what the credit engine actually charges.
   */
  const loadCredits = () =>
    fetch("/api/credits", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setCredits({
          available: typeof data.available === "number" ? data.available : null,
          image: data.costs?.image ?? null,
          video: data.costs?.video ?? null,
        });
        // The studio knows a render just settled before the header pill does.
        notifyCreditsChanged();
      })
      // The studio works perfectly well without a balance on screen.
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
    fetch("/api/studio/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "tiers",
        intent: videoIntent("", videoAspect, cameraMotion, videoTier, videoSeconds),
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.tiers)) return;
        setTierPrices(data.tiers as TierPrice[]);
      })
      // Prices are a courtesy here; the binding quote still comes before render.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Deliberately not keyed on `prompt` or `videoTier`: neither changes the
    // price of the options, and re-quoting on every keystroke would hammer a
    // rate-limited endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, videoAspect, videoSeconds]);

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
        id: newMediaId(),
        kind: "image",
        prompt: prompt.trim(),
        aspectRatio: imageAspect,
        styleName:
          IMAGE_LOOKS.find((entry) => entry.value === look)?.label || look,
        url: data.image,
        createdAt: "Just now",
      };
      setGallery((previous) => [newItem, ...previous]);
      setGalleryFilter("all");
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

  const requestVideoQuote = async () => {
    if (!prompt.trim() || generating || videoJob) return;
    setGenerating(true);
    setToastNotice("Checking today's price…");
    setToastError(false);
    try {
      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newRequestId("vid"),
        },
        body: JSON.stringify({
          action: "quote",
          intent: videoIntent(
            prompt.trim(),
            videoAspect,
            cameraMotion,
            videoTier,
            videoSeconds,
          ),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.costUsd !== "number") {
        if (response.status === 402) {
          await openCreditPanel(
            typeof data.required === "number" ? data.required : 12,
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
            "Video pricing is unavailable right now.",
        );
      }
      setVideoQuote({
        costUsd: data.costUsd,
        credits: data.credits || 16,
        model: data.model,
        intent:
          data.intent ||
          videoIntent(prompt.trim(), videoAspect, cameraMotion, videoTier, videoSeconds),
      });
      setToastNotice("");
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

  const confirmVideoRender = async () => {
    if (!videoQuote || generating) return;
    const quote = videoQuote;
    setVideoQuote(null);
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
          // Keep the quote so the person can confirm again once topped up.
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
      const job: VideoJob = {
        token: data.token,
        jobId: data.jobId,
        status: data.status || "pending",
        prompt: prompt.trim(),
        duration: "4s",
        aspectRatio: videoAspect,
      };
      persistVideoJob(job);
      // The render now has a placeholder card in the gallery; make sure the
      // active filter cannot hide it.
      setGalleryFilter("all");
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
          id: newMediaId(),
          kind: "video",
          prompt: job.prompt,
          aspectRatio: job.aspectRatio || "16:9",
          styleName: `${job.duration} clip`,
          url: data.downloadUrl,
          createdAt: "Just now",
        };
        setGallery((previous) => [newItem, ...previous]);
        clearVideoJob();
        setGalleryFilter("all");
        showToast("Your video is ready — it is in your work below.", false);
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
  const cost = isVideo ? credits.video : credits.image;
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

  /** Ctrl/⌘+Enter starts the work without reaching for the button. */
  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (!canGenerate) return;
    void (isVideo ? requestVideoQuote() : handleGenerateImage());
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
        <section className="ms-results" aria-label="Your work">
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
                  onClick={() => setGalleryFilter(value)}
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
              {visible.map((item, index) => (
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
                        const price = tierPrices.find(
                          (entry) => entry.tier === tier.value,
                        );
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

          {videoQuote ? (
            <div className="ms-quote" role="status">
              <div>
                <b>{videoQuote.credits} credits for this render</b>
                <small>
                  You are only charged if it works. A failed render returns your
                  credits.
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
                  onClick={confirmVideoRender}
                  disabled={generating}
                >
                  Render it
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

            <p className="ms-cost-note">
              {cost
                ? `${cost.from}–${cost.to} credits${isVideo ? " · exact price shown first" : " per image"}`
                : "Charged only when the work succeeds"}
            </p>

            <button
              type="button"
              className={`ms-generate${generating ? " is-busy" : ""}`}
              onClick={isVideo ? requestVideoQuote : handleGenerateImage}
              disabled={!canGenerate}
            >
              <StudioIcon name="spark" />
              {/* Both labels ship; CSS picks the one the width can hold, so a
                  phone never gets "See price and render" squeezed into a chip. */}
              <span className="ms-generate-long">
                {generating
                  ? isVideo
                    ? "Checking price…"
                    : "Making it…"
                  : isVideo
                    ? videoJob
                      ? "Rendering…"
                      : "See price and render"
                    : "Make the image"}
              </span>
              <span className="ms-generate-short">
                {generating
                  ? isVideo
                    ? "Checking…"
                    : "Making…"
                  : isVideo
                    ? videoJob
                      ? "Rendering…"
                      : "See price"
                    : "Make image"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
