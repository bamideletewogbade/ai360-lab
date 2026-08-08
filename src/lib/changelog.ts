export type ChangelogStatus = 'Now' | 'Pilot' | 'Foundation'

export type ChangelogRelease = {
  id: string
  date: string
  displayDate: string
  status: ChangelogStatus
  title: string
  summary: string
  changes: readonly string[]
}

export const CHANGELOG_RELEASES: readonly ChangelogRelease[] = [
  {
    id: 'production-readiness',
    date: '2026-08-08',
    displayDate: '8 August 2026',
    status: 'Now',
    title: 'A clearer, more trustworthy public experience',
    summary: 'We tightened the product language, public interface and discovery layer while keeping the release status honest.',
    changes: [
      'Standardized the AI360 name across product copy, metadata and machine-readable pages.',
      'Added crawl controls, canonical URLs, a sitemap, structured data and a public AI-readable product summary.',
      'Improved responsive layouts, calls to action, video behavior and the shared navigation and footer.',
      'Made pricing explicit that checkout remains closed until payment verification is complete.',
    ],
  },
  {
    id: 'durable-work',
    date: '2026-08-05',
    displayDate: '5 August 2026',
    status: 'Pilot',
    title: 'Durable work, credits and safer production',
    summary: 'The product moved to one application data plane and gained stronger accounting and recovery foundations.',
    changes: [
      'Completed the application cutover to Supabase Postgres and removed the former MySQL runtime.',
      'Added credit reservation, settlement, release, monthly allowance and reconciliation flows.',
      'Persisted agent runs, tasks, events, artifacts and checkpoints at workflow boundaries.',
      'Required identified workspaces for expensive Agent and Studio work when identity is configured.',
    ],
  },
  {
    id: 'studio-workspace',
    date: '2026-08-01',
    displayDate: '1 August 2026',
    status: 'Pilot',
    title: 'A workspace organized around outcomes',
    summary: 'Quick answers, research and creative production became clearer parts of one working environment.',
    changes: [
      'Redesigned the workspace and made public navigation aware of signed-in sessions.',
      'Added approval-gated Studio image and video production with quotes before provider work begins.',
      'Improved generated image handling and added short campaign outcome demonstrations.',
      'Kept private workspaces out of search indexes while making public product pages easier to understand.',
    ],
  },
  {
    id: 'coordinated-builds',
    date: '2026-07-25',
    displayDate: '25 July 2026',
    status: 'Foundation',
    title: 'Coordinated Studio builds',
    summary: 'Studio gained the foundation for specialist workflows that produce several connected assets from one approved direction.',
    changes: [
      'Added coordinated build packs with sequential stages and parallel specialists where the work allows it.',
      'Streamed progress and partial results so useful output appears before the full pack is complete.',
      'Introduced explicit approval boundaries for media production and provider cost.',
      'Prevented stale application shells from surviving a new Hostinger deployment.',
    ],
  },
] as const
