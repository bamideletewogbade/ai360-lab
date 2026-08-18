import { z } from 'zod'
import type { Intake } from '@/lib/studio-project-model'
import type { PackId } from '@/lib/studio/packs'

export type StudioBriefTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type StudioDraft = {
  id: string
  updatedAt: number
  packId: PackId
  intake: Intake
  turns: StudioBriefTurn[]
  unsentText: string
  /** Reserved for the durable build rollout. Never contains credentials. */
  activeRunId?: string
}

const intakeSchema = z.object({
  businessName: z.string().max(255),
  industry: z.string().max(255),
  offer: z.string().max(20_000),
  audience: z.string().max(20_000),
  goal: z.string().max(500),
  location: z.string().max(255),
  channels: z.array(z.string().max(100)).max(20),
  notes: z.string().max(60_000),
})

export const studioDraftSchema = z.object({
  id: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative(),
  packId: z.enum(['research', 'plan', 'write', 'learn', 'decide', 'launch', 'marketing', 'ads', 'naming', 'pitch', 'calendar']),
  intake: intakeSchema,
  turns: z.array(z.object({
    id: z.string().min(1).max(64),
    role: z.enum(['user', 'assistant']),
    content: z.string().max(20_000),
  })).max(80),
  unsentText: z.string().max(20_000),
  activeRunId: z.string().max(160).optional(),
})

export function newerDraft(first: StudioDraft | null, second: StudioDraft | null) {
  if (!first) return second
  if (!second) return first
  return first.updatedAt >= second.updatedAt ? first : second
}
