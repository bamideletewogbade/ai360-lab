import { createHash, timingSafeEqual } from 'node:crypto'
import type {
  ActionPolicyResult, ActionRisk, NormalizedAction,
} from '@/lib/agent/tool-contracts'

export type BrowserPilotMode = 'read_only' | 'draft' | 'approved_write' | 'internal_desktop'

export type ApprovalReceipt = {
  id: string
  status: 'approved' | 'rejected' | 'expired' | 'cancelled'
  workspaceKey: string
  runId: string
  actionId: string
  payloadHash: string
  expiresAt: string
}

type PolicyInput = {
  action: NormalizedAction
  workspaceKey: string
  runId: string
  pilotMode: BrowserPilotMode
  allowedDomains: string[]
  userAuthorizedTask: boolean
  approval?: ApprovalReceipt | null
  now?: Date
}

const CONSEQUENCE_WORDS = /\b(submit|send|publish|post|pay|purchase|buy|book|confirm|delete|remove|cancel|agree|accept|transfer|withdraw)\b/i
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function actionPayloadHash(action: NormalizedAction) {
  return createHash('sha256').update(canonical({
    id: action.id,
    kind: action.kind,
    capability: action.capability,
    effect: action.effect,
    dataClass: action.dataClass,
    target: action.target ?? null,
    url: action.url ?? null,
    input: action.input,
    expectedOutcome: action.expectedOutcome,
    idempotencyKey: action.idempotencyKey,
  })).digest('hex')
}

function exactHash(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export function safePublicUrl(value: string | undefined, allowedDomains: string[]) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || PRIVATE_HOST.test(url.hostname)) return null
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const allowed = allowedDomains.some((domain) => {
      const normalized = domain.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
      return hostname === normalized || hostname.endsWith(`.${normalized}`)
    })
    return allowed ? url : null
  } catch {
    return null
  }
}

export function riskForAction(action: NormalizedAction): ActionRisk {
  if (action.effect === 'prohibited' || action.capability === 'desktop.control') return 'prohibited'
  if (
    ['external_write', 'financial', 'destructive'].includes(action.effect)
    || ['submit', 'external_write', 'upload'].includes(action.kind)
    || ['sensitive', 'secret'].includes(action.dataClass)
    || CONSEQUENCE_WORDS.test(`${action.observedRole ?? ''} ${action.observedLabel ?? ''}`)
  ) return 'consequential'
  if (action.effect === 'draft' || ['navigate', 'click', 'type', 'download'].includes(action.kind)) return 'reversible'
  return 'passive'
}

function validApproval(input: PolicyInput) {
  const receipt = input.approval
  if (!receipt || receipt.status !== 'approved') return false
  if (receipt.workspaceKey !== input.workspaceKey || receipt.runId !== input.runId || receipt.actionId !== input.action.id) return false
  if (new Date(receipt.expiresAt).getTime() <= (input.now ?? new Date()).getTime()) return false
  return exactHash(receipt.payloadHash, actionPayloadHash(input.action))
}

function result(decision: ActionPolicyResult['decision'], risk: ActionRisk, reasonCode: ActionPolicyResult['reasonCode'], reason: string): ActionPolicyResult {
  return { decision, risk, reasonCode, reason }
}

export function evaluateActionPolicy(input: PolicyInput): ActionPolicyResult {
  const { action } = input
  const risk = riskForAction(action)

  if (!input.userAuthorizedTask) return result('block', risk, 'outside_user_scope', 'This action is outside the task the customer authorized.')
  if (risk === 'prohibited') return result('block', risk, 'prohibited_action', 'This capability is not available in the current rollout.')

  if (action.url && !safePublicUrl(action.url, input.allowedDomains)) {
    return result('block', risk, 'domain_not_allowed', 'The destination is not in this run’s approved domain scope.')
  }

  if ((action.kind === 'navigate' || action.kind === 'download') && !action.url) {
    return result('block', risk, 'invalid_target', 'This action needs a valid public destination.')
  }

  if (action.capability === 'external.write' && input.pilotMode !== 'approved_write') {
    return result('block', risk, 'capability_not_enabled', 'External writes are not enabled in this rollout.')
  }

  if (risk === 'consequential') {
    if (input.pilotMode === 'read_only' || input.pilotMode === 'draft') {
      return result('block', risk, 'pilot_write_disabled', 'This rollout may prepare work but cannot submit it.')
    }
    if (!validApproval(input)) {
      return result('approval_required', risk, 'approval_missing', 'Review the exact destination and changes before AI360 continues.')
    }
    return result('allow', risk, 'approved_exact_action', 'The customer approved this exact action and payload.')
  }

  if (action.effect === 'draft' && input.pilotMode === 'read_only') {
    return result('block', risk, 'capability_not_enabled', 'Drafting into a website is not enabled in the read-only pilot.')
  }

  return risk === 'passive'
    ? result('allow', risk, 'allowed_passive', 'This action only observes the allowed environment.')
    : result('allow', risk, 'allowed_reversible', 'This reversible browser action is within the run’s domain scope.')
}
