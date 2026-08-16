export type ChangelogStatus = "Now" | "Pilot" | "Foundation";

export type ChangelogRelease = {
  id: string;
  date: string;
  displayDate: string;
  status: ChangelogStatus;
  title: string;
  summary: string;
  changes: readonly string[];
};

export const CHANGELOG_RELEASES: readonly ChangelogRelease[] = [
  {
    id: "media-studio-live",
    date: "2026-08-15",
    displayDate: "15 August 2026",
    status: "Now",
    title: "Media Studio now makes what you ask for",
    summary:
      "Media Studio generates real images and videos from your own words, shows the price before video renders, and returns your credits if a render fails.",
    changes: [
      "Images and videos are now generated from your prompt and delivered to the asset gallery instead of showing placeholder examples.",
      "Video shows the price in credits first, and a render that fails returns your credits.",
      "A render that is still running when you reload the page picks up where it left off.",
      "If you run out of credits, quick top-ups and monthly plans are offered right where you need them.",
      "Everyday chat is included, and after your daily limit extra chat costs 1 credit per message.",
    ],
  },
  {
    id: "durable-media-setup",
    date: "2026-08-09",
    displayDate: "9 August 2026",
    status: "Pilot",
    title: "Visual creation now starts with the outcome",
    summary:
      "Studio can prepare image and video choices from project context, show the credit cost and recover saved media work after a refresh.",
    changes: [
      "Added simple choices for channel, shape, quality, resolution, video length and movement without exposing model names.",
      "Added exact capability and price checks before approved video work begins.",
      "Made signed-in media jobs durable and linked their private outputs to the project that created them.",
      "Kept generated text and audio outside the first visual rollout so important copy stays editable and reviewable.",
    ],
  },
  {
    id: "expresspay-foundation",
    date: "2026-08-08",
    displayDate: "8 August 2026",
    status: "Foundation",
    title: "Safer local payments are ready for sandbox verification",
    summary:
      "AI360 now has a hosted ExpressPay checkout path designed for Mobile Money and cards without handling sensitive payment details.",
    changes: [
      "Added a clear plan review and secure handoff to ExpressPay hosted checkout.",
      "Required a direct server check before any plan or credits can activate.",
      "Made repeat notifications and page refreshes safe through one-time activation and ledger controls.",
      "Kept live charging closed until card, Mobile Money and delayed-payment sandbox tests pass.",
    ],
  },
  {
    id: "quality-loop",
    date: "2026-08-08",
    displayDate: "8 August 2026",
    status: "Pilot",
    title: "A clearer way to report problems and track what happens next",
    summary:
      "Customers can now flag weak answers, serious concerns and missing features without leaving their work.",
    changes: [
      "Added one quiet feedback action beside each answer, with useful, improvement and serious-issue paths available when opened.",
      "Made message sharing optional and gave every report a private status receipt.",
      "Added rule-first urgent review, a bounded AI quality check and a human decision queue.",
      "Turned approved failures into private test candidates so fixes can be checked before release.",
    ],
  },
  {
    id: "production-readiness",
    date: "2026-08-08",
    displayDate: "8 August 2026",
    status: "Now",
    title: "A clearer, more trustworthy public experience",
    summary:
      "We tightened the product language, public interface and discovery layer while keeping the release status honest.",
    changes: [
      "Standardized the AI360 name across product copy, metadata and machine-readable pages.",
      "Added crawl controls, canonical URLs, a sitemap, structured data and a public AI-readable product summary.",
      "Improved responsive layouts, calls to action, video behavior and the shared navigation and footer.",
      "Made pricing explicit that checkout remains closed until payment verification is complete.",
    ],
  },
  {
    id: "durable-work",
    date: "2026-08-05",
    displayDate: "5 August 2026",
    status: "Pilot",
    title: "Durable work, credits and safer production",
    summary:
      "The product moved to one application data plane and gained stronger accounting and recovery foundations.",
    changes: [
      "Completed the application cutover to Supabase Postgres and removed the former MySQL runtime.",
      "Added credit reservation, settlement, release, monthly allowance and reconciliation flows.",
      "Persisted agent runs, tasks, events, artifacts and checkpoints at workflow boundaries.",
      "Required identified workspaces for expensive Agent and Studio work when identity is configured.",
    ],
  },
  {
    id: "studio-workspace",
    date: "2026-08-01",
    displayDate: "1 August 2026",
    status: "Pilot",
    title: "A workspace organized around outcomes",
    summary:
      "Quick answers, research and creative production became clearer parts of one working environment.",
    changes: [
      "Redesigned the workspace and made public navigation aware of signed-in sessions.",
      "Added approval-gated Studio image and video production with quotes before provider work begins.",
      "Improved generated image handling and added short campaign outcome demonstrations.",
      "Kept private workspaces out of search indexes while making public product pages easier to understand.",
    ],
  },
  {
    id: "coordinated-builds",
    date: "2026-07-25",
    displayDate: "25 July 2026",
    status: "Foundation",
    title: "Coordinated Studio builds",
    summary:
      "Studio gained the foundation for specialist workflows that produce several connected assets from one approved direction.",
    changes: [
      "Added coordinated build packs with sequential stages and parallel specialists where the work allows it.",
      "Streamed progress and partial results so useful output appears before the full pack is complete.",
      "Introduced explicit approval boundaries for media production and provider cost.",
      "Prevented stale application shells from surviving a new Hostinger deployment.",
    ],
  },
] as const;
