import { z } from 'zod'

export const TOOL_CAPABILITIES = [
  'browser.observe',
  'browser.navigate',
  'browser.interact',
  'browser.transfer',
  'external.write',
  'desktop.control',
  'orchestration.control',
] as const

export const ACTION_KINDS = [
  'observe_dom',
  'screenshot',
  'navigate',
  'click',
  'type',
  'scroll',
  'wait',
  'upload',
  'download',
  'submit',
  'external_write',
  'ask_user',
  'finish',
] as const

export const ACTION_EFFECTS = [
  'passive',
  'navigation',
  'draft',
  'external_write',
  'financial',
  'destructive',
  'prohibited',
] as const

export const DATA_CLASSES = ['public', 'workspace', 'personal', 'sensitive', 'secret'] as const

const ACTION_CAPABILITY: Record<ActionKind, ToolCapability> = {
  observe_dom: 'browser.observe',
  screenshot: 'browser.observe',
  navigate: 'browser.navigate',
  click: 'browser.interact',
  type: 'browser.interact',
  scroll: 'browser.interact',
  wait: 'browser.interact',
  upload: 'browser.transfer',
  download: 'browser.transfer',
  submit: 'external.write',
  external_write: 'external.write',
  ask_user: 'orchestration.control',
  finish: 'orchestration.control',
}

export const normalizedActionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  kind: z.enum(ACTION_KINDS),
  capability: z.enum(TOOL_CAPABILITIES),
  effect: z.enum(ACTION_EFFECTS),
  dataClass: z.enum(DATA_CLASSES).default('public'),
  target: z.string().trim().max(2_000).optional(),
  url: z.string().trim().max(4_000).optional(),
  observedRole: z.string().trim().max(120).optional(),
  observedLabel: z.string().trim().max(500).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  expectedOutcome: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.string().trim().min(8).max(180),
}).superRefine((action, context) => {
  if (action.capability === 'desktop.control') return
  if (ACTION_CAPABILITY[action.kind] !== action.capability) {
    context.addIssue({
      code: 'custom',
      path: ['capability'],
      message: `${action.kind} requires ${ACTION_CAPABILITY[action.kind]}`,
    })
  }
})

export type ToolCapability = typeof TOOL_CAPABILITIES[number]
export type ActionKind = typeof ACTION_KINDS[number]
export type ActionEffect = typeof ACTION_EFFECTS[number]
export type DataClass = typeof DATA_CLASSES[number]
export type NormalizedAction = z.infer<typeof normalizedActionSchema>

export type ActionRisk = 'passive' | 'reversible' | 'consequential' | 'prohibited'
export type PolicyDecision = 'allow' | 'approval_required' | 'block'

export type ActionPolicyResult = {
  decision: PolicyDecision
  risk: ActionRisk
  reason: string
  reasonCode:
    | 'allowed_passive'
    | 'allowed_reversible'
    | 'approved_exact_action'
    | 'approval_missing'
    | 'capability_not_enabled'
    | 'domain_not_allowed'
    | 'invalid_target'
    | 'outside_user_scope'
    | 'pilot_write_disabled'
    | 'prohibited_action'
}

export type BrowserRunEvent =
  | { type: 'run.started'; summary: string }
  | { type: 'plan.created'; summary: string; objectives: string[] }
  | { type: 'browser.session_started'; summary: string; sessionId: string }
  | { type: 'page.opened'; summary: string; url: string }
  | { type: 'action.proposed'; summary: string; action: NormalizedAction }
  | { type: 'approval.requested'; summary: string; approvalId: string; actionId: string }
  | { type: 'approval.granted'; summary: string; approvalId: string; actionId: string }
  | { type: 'action.executed'; summary: string; actionId: string }
  | { type: 'outcome.verified'; summary: string; actionId: string; passed: boolean }
  | { type: 'run.completed'; summary: string }
  | { type: 'run.failed'; summary: string; errorCode: string }
