import { packCredits, packSpecialists, type Pack, type PackId, type SpecialistId } from '@/lib/studio/packs'
import type { PackSection } from '@/lib/studio/coordinator'
import type { SectionEvaluation } from '@/lib/studio/evaluator'

export type Intake = {
  businessName: string
  industry: string
  offer: string
  audience: string
  goal: string
  location: string
  channels: string[]
  notes: string
}

export type BrandProfile = {
  summary: string
  audience: string
  personality: string[]
  voice: string
  colors: Array<{ name: string; hex: string; role: string }>
  tagline: string
  valueProposition: string
}

export type Campaign = {
  name: string
  objective: string
  bigIdea: string
  callToAction: string
  channels: string[]
  successMeasures: string[]
}

export type AssetVersion = {
  version: number
  content: string
  createdAt: number
  reason: 'created' | 'ai_revision' | 'manual_edit'
}

export type StudioAsset = {
  id: string
  type: 'strategy' | 'messaging' | 'whatsapp' | 'social' | 'flyer' | 'direct' | 'logo' | 'video'
  title: string
  channel: string
  purpose: string
  content: string
  status?: 'draft' | 'approved'
  specialistId?: SpecialistId
  version?: number
  versions?: AssetVersion[]
}

export type ProjectPack = {
  id: PackId
  name: string
  outcome: string
  bestFor: string
  estimatedCredits: number
  promisedDeliverables: string[]
}

export type ProjectSpecialist = {
  id: SpecialistId
  label: string
  working: string
  status: 'pending' | 'active' | 'complete' | 'failed'
  detail?: string
}

export type ProjectRun = {
  status: 'complete' | 'partial' | 'failed'
  startedAt: number
  completedAt: number
  specialists: ProjectSpecialist[]
  producedSections: number
  review?: {
    passed: boolean
    evaluations: SectionEvaluation[]
  }
}

export type StudioProject = {
  id: string
  createdAt: number
  updatedAt: number
  intake: Intake
  brand: BrandProfile
  campaign: Campaign
  assets: StudioAsset[]
  sources?: Array<{ title: string; url: string }>
  archivedAt?: number
  schemaVersion?: 2
  pack?: ProjectPack
  run?: ProjectRun
}

const SECTION_PRESENTATION: Record<SpecialistId, Pick<StudioAsset, 'title' | 'type' | 'channel' | 'purpose'>> = {
  researcher: { title: 'Market research', type: 'strategy', channel: 'Research', purpose: 'Current evidence and useful market context' },
  brand: { title: 'Brand direction', type: 'strategy', channel: 'Brand', purpose: 'A consistent promise, voice and visual direction' },
  campaign: { title: 'Campaign plan', type: 'strategy', channel: 'Campaign', purpose: 'The idea, channels, timing and measures' },
  copy: { title: 'Ready-to-use copy', type: 'messaging', channel: 'Multiple channels', purpose: 'Copy ready to review, adapt and send' },
  namer: { title: 'Name candidates', type: 'messaging', channel: 'Brand', purpose: 'Names with reasoning and practical risks' },
  domains: { title: 'Domain checks', type: 'direct', channel: 'Web', purpose: 'Availability results checked against live registries' },
  ads: { title: 'Ad variants', type: 'messaging', channel: 'Paid media', purpose: 'Distinct ad angles worth testing' },
  calendar: { title: 'Content calendar', type: 'social', channel: 'Social media', purpose: 'A practical four-week publishing plan' },
  pitch: { title: 'Pitch materials', type: 'strategy', channel: 'Pitch', purpose: 'A clear case for customers, partners or funders' },
}

export function packProjectAssets(sections: PackSection[], createdAt: number): StudioAsset[] {
  return sections.map((section, index) => {
    const presentation = SECTION_PRESENTATION[section.id]
    return {
      id: `${section.id}-${index + 1}`,
      ...presentation,
      content: section.content,
      status: 'draft',
      specialistId: section.id,
      version: 1,
      versions: [{ version: 1, content: section.content, createdAt, reason: 'created' }],
    }
  })
}

export function createPackProject(input: {
  id: string
  intake: Intake
  pack: Pack
  sections: PackSection[]
  sources: Array<{ title: string; url: string }>
  specialists: ProjectSpecialist[]
  startedAt: number
  completedAt: number
  evaluations?: SectionEvaluation[]
}): StudioProject {
  const failed = input.specialists.filter((specialist) => specialist.status === 'failed').length
  const assets = packProjectAssets(input.sections, input.completedAt)
  return {
    id: input.id,
    createdAt: input.completedAt,
    updatedAt: input.completedAt,
    schemaVersion: 2,
    intake: input.intake,
    pack: {
      id: input.pack.id,
      name: input.pack.name,
      outcome: input.pack.outcome,
      bestFor: input.pack.bestFor,
      estimatedCredits: packCredits(input.pack),
      promisedDeliverables: input.pack.deliverables,
    },
    run: {
      status: failed ? 'partial' : 'complete',
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      specialists: input.specialists,
      producedSections: assets.length,
      review: input.evaluations ? {
        passed: input.evaluations.every((evaluation) => evaluation.passed),
        evaluations: input.evaluations,
      } : undefined,
    },
    brand: {
      summary: input.pack.outcome,
      audience: input.intake.audience,
      personality: [],
      voice: 'Defined in the project deliverables',
      colors: [],
      tagline: input.pack.name,
      valueProposition: input.intake.offer,
    },
    campaign: {
      name: `${input.intake.businessName} ${input.pack.name}`,
      objective: input.intake.goal,
      bigIdea: input.pack.outcome,
      callToAction: 'Review and approve the deliverables',
      channels: input.intake.channels,
      successMeasures: input.pack.deliverables,
    },
    assets,
    sources: input.sources,
  }
}

export function initialProjectSpecialists(pack: Pack): ProjectSpecialist[] {
  return packSpecialists(pack).map((id) => ({
    id,
    label: SECTION_PRESENTATION[id].title,
    working: SECTION_PRESENTATION[id].purpose,
    status: 'pending',
  }))
}

export function addAssetVersion(asset: StudioAsset, content: string, reason: AssetVersion['reason'], createdAt: number): StudioAsset {
  const version = (asset.version ?? 1) + 1
  return {
    ...asset,
    content,
    status: 'draft',
    version,
    versions: [...(asset.versions ?? [{ version: 1, content: asset.content, createdAt, reason: 'created' }]), { version, content, createdAt, reason }],
  }
}
