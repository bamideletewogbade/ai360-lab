import 'server-only'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import { getPostgres } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import type { FeedbackRequest, QualitySeverity, QualityStatus } from '@/lib/quality/contracts'
import { qualityBenchmark, type QualityActionProposal, type QualityTriage } from '@/lib/quality/triage'

export type CreatedQualityReport = {
  id: string
  token: string
  severity: QualitySeverity
  status: QualityStatus
}

export type QualityReportForEvaluation = {
  id: string
  category: FeedbackRequest['category']
  severity: QualitySeverity
  status: QualityStatus
  source_surface: FeedbackRequest['sourceSurface']
  comment: string | null
  evidence_excerpt: string | null
  contact_allowed: boolean
}

function reportId() {
  return `ql_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
}

function actionId() {
  return `qa_${randomUUID().replaceAll('-', '').slice(0, 18)}`
}

function evalId() {
  return `qe_${randomUUID().replaceAll('-', '').slice(0, 18)}`
}

export function qualityTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createQualityReport(
  input: FeedbackRequest,
  triage: QualityTriage,
  context: WorkspaceAuthContext | null,
): Promise<CreatedQualityReport> {
  const id = reportId()
  const token = randomBytes(24).toString('base64url')
  const tokenHash = qualityTokenHash(token)
  const sql = getPostgres()

  await sql.begin(async (tx) => {
    if (context) await ensureWorkspaceRecord(tx, context)
    await tx`
      insert into public.lab_quality_reports
        (id, workspace_key, reporter_id, report_kind, sentiment, category, severity, status,
         source_surface, conversation_id, message_id, request_id, run_id, comment,
         evidence_scope, evidence_excerpt, immediate_risk, contact_allowed, contact_email,
         reporter_token_hash, client_release)
      values
        (${id}, ${context?.workspace.key ?? null}, ${context?.userId ?? null}, ${input.reportKind},
         ${input.sentiment}, ${input.category}, ${triage.severity}, ${triage.status},
         ${input.sourceSurface}, ${input.conversationId}, ${input.messageId}, ${input.requestId},
         ${input.runId}, ${input.comment}, ${input.evidenceScope}, ${input.evidenceExcerpt},
         ${input.immediateRisk}, ${input.contactAllowed}, ${input.contactEmail}, ${tokenHash},
         ${input.clientRelease})`
    await tx`
      insert into public.lab_quality_events
        (report_id, actor_type, event_type, visibility, summary)
      values (${id}, 'customer', 'report_received', 'customer', 'Your report was received.')`
    await tx`
      insert into public.lab_quality_events
        (report_id, actor_type, event_type, visibility, summary, metadata)
      values (${id}, 'system', 'rules_triaged', 'reviewer', ${triage.summary},
              ${tx.json({ severity: triage.severity, status: triage.status })})`
    for (const action of triage.actions) {
      await insertAction(tx, id, action, 'rules')
    }
  })

  return { id, token, severity: triage.severity, status: triage.status }
}

async function insertAction(
  sql: TransactionSql,
  reportIdValue: string,
  action: QualityActionProposal,
  proposedBy: 'rules' | 'ai' | 'human',
) {
  await sql`
    insert into public.lab_quality_actions
      (id, report_id, action_type, proposed_by, requires_human, summary)
    values (${actionId()}, ${reportIdValue}, ${action.type}, ${proposedBy},
            ${action.requiresHuman}, ${action.summary})
    on conflict (report_id, action_type) do update
      set summary = excluded.summary, updated_at = now()`
}

export async function getQualityReportForEvaluation(id: string) {
  const rows = await getPostgres()<QualityReportForEvaluation[]>`
    select id, category, severity, status, source_surface, comment,
           evidence_excerpt, contact_allowed
      from public.lab_quality_reports
     where id = ${id}
     limit 1`
  return rows[0] ?? null
}

export async function recordQualityEvaluation(input: {
  id: string
  severity: QualitySeverity
  category: FeedbackRequest['category']
  summary: string
  confidence: number
  recommendedAction: string
  createEvalCase: boolean
  proposeFix: boolean
}) {
  const sql = getPostgres()
  await sql.begin(async (tx) => {
    const status = input.severity === 's0' || input.severity === 's1' ? 'human_review' : 'evaluating'
    await tx`
      update public.lab_quality_reports
         set severity = ${input.severity}, status = case when status = 'closed' then status else ${status} end,
             ai_summary = ${input.summary}, ai_category = ${input.category},
             ai_confidence = ${input.confidence}, ai_recommended_action = ${input.recommendedAction},
             evaluated_at = now(), updated_at = now()
       where id = ${input.id}`
    await tx`
      insert into public.lab_quality_events
        (report_id, actor_type, event_type, visibility, summary, metadata)
      values (${input.id}, 'ai', 'quality_evaluated', 'reviewer', ${input.summary},
              ${tx.json({ confidence: input.confidence, category: input.category })})`
    if (input.severity === 's0' || input.severity === 's1') {
      await insertAction(tx, input.id, {
        type: 'alert_human',
        summary: input.severity === 's0' ? 'Ask a human to review this now.' : 'Ask a human to review this urgently.',
        requiresHuman: false,
      }, 'ai')
    }
    if (input.proposeFix) {
      await insertAction(tx, input.id, {
        type: 'propose_fix',
        summary: input.recommendedAction,
        requiresHuman: true,
      }, 'ai')
    }
    if (input.createEvalCase) {
      const report = await tx<QualityReportForEvaluation[]>`
        select id, category, severity, status, source_surface, comment,
               evidence_excerpt, contact_allowed
          from public.lab_quality_reports where id = ${input.id} limit 1`
      const current = report[0]
      if (current) {
        await tx`
          insert into public.lab_quality_eval_cases
            (id, report_id, benchmark, task_summary, sanitized_input, expected_checks)
          values (${evalId()}, ${input.id}, ${qualityBenchmark(current.category)},
                  ${input.summary}, ${current.evidence_excerpt},
                  ${tx.json(['Reproduce the reported failure', 'Confirm the fix does not regress related tasks'])})
          on conflict (report_id) do nothing`
        await tx`
          update public.lab_quality_actions
             set status = 'completed', updated_at = now()
           where report_id = ${input.id} and action_type = 'create_eval_case'`
      }
    }
  })
}

export async function recordHumanAlertResult(id: string, delivered: boolean) {
  const sql = getPostgres()
  await sql.begin(async (tx) => {
    await tx`
      update public.lab_quality_actions
         set status = ${delivered ? 'completed' : 'proposed'}, updated_at = now()
       where report_id = ${id} and action_type = 'alert_human'`
    await tx`
      insert into public.lab_quality_events
        (report_id, actor_type, event_type, visibility, summary)
      values (${id}, 'system', ${delivered ? 'human_alert_sent' : 'human_alert_waiting'}, 'reviewer',
              ${delivered ? 'The reviewer alert was delivered.' : 'This case is waiting in the urgent review queue.'})`
  })
}

export async function readCustomerQualityReceipt(input: {
  id: string
  token?: string | null
  context: WorkspaceAuthContext | null
}) {
  const tokenHash = input.token ? qualityTokenHash(input.token) : null
  const rows = await getPostgres()<Array<{
    id: string
    status: QualityStatus
    severity: QualitySeverity
    category: string
    created_at: string
    updated_at: string
    summary: string | null
  }>>`
    select report.id, report.status, report.severity, report.category,
           report.created_at, report.updated_at,
           coalesce(
             (select event.summary from public.lab_quality_events event
               where event.report_id = report.id and event.visibility = 'customer'
               order by event.created_at desc limit 1),
             case when report.status in ('verified', 'closed') then report.ai_summary else null end
           ) as summary
      from public.lab_quality_reports report
     where report.id = ${input.id}
       and (
         (${input.context?.userId ?? null}::text is not null and report.reporter_id = ${input.context?.userId ?? null})
         or (${tokenHash}::text is not null and report.reporter_token_hash = ${tokenHash})
       )
     limit 1`
  return rows[0] ?? null
}

export async function listQualityQueue() {
  const sql = getPostgres()
  return sql.begin(async (tx) => {
    const reports = await tx<Array<{
      id: string
      report_kind: string
      sentiment: string | null
      category: string
      severity: QualitySeverity
      status: QualityStatus
      source_surface: string
      comment: string | null
      evidence_scope: string
      immediate_risk: boolean
      contact_allowed: boolean
      contact_email: string | null
      ai_summary: string | null
      ai_confidence: string | number | null
      ai_recommended_action: string | null
      created_at: string
      action_count: string | number
      open_action_count: string | number
    }>>`
      select report.id, report.report_kind, report.sentiment, report.category,
             report.severity, report.status, report.source_surface, report.comment,
             report.evidence_scope, report.immediate_risk, report.contact_allowed, report.contact_email,
             report.ai_summary, report.ai_confidence, report.ai_recommended_action,
             report.created_at, count(action.id) as action_count,
             count(action.id) filter (where action.status in ('proposed', 'approved', 'running')) as open_action_count
        from public.lab_quality_reports report
        left join public.lab_quality_actions action on action.report_id = report.id
       group by report.id
       order by report.severity, report.created_at desc
       limit 100`
    const metrics = await tx<Array<{
      total: string | number
      urgent: string | number
      awaiting_human: string | number
      eval_candidates: string | number
      verified: string | number
    }>>`
      select count(*) as total,
             count(*) filter (where severity in ('s0', 's1')) as urgent,
             count(*) filter (where status = 'human_review') as awaiting_human,
             (select count(*) from public.lab_quality_eval_cases where status = 'candidate') as eval_candidates,
             count(*) filter (where status = 'verified') as verified
        from public.lab_quality_reports
       where created_at >= now() - interval '30 days'`
    return { reports, metrics: metrics[0] }
  })
}

export async function updateQualityReview(input: {
  id: string
  status: 'human_review' | 'fix_planned' | 'verified' | 'closed'
  note: string
  reviewerId: string
}) {
  const sql = getPostgres()
  const changed = await sql.begin(async (tx) => {
    const rows = await tx<Array<{ id: string }>>`
      update public.lab_quality_reports
         set status = ${input.status},
             acknowledged_at = case when acknowledged_at is null then now() else acknowledged_at end,
             resolved_at = case when ${input.status} in ('verified', 'closed') then now() else resolved_at end,
             updated_at = now()
       where id = ${input.id}
       returning id`
    if (!rows.length) return false
    await tx`
      insert into public.lab_quality_events
        (report_id, actor_type, event_type, visibility, summary, metadata)
      values (${input.id}, 'human', 'review_updated', 'customer', ${input.note},
              ${tx.json({ status: input.status, reviewerId: input.reviewerId })})`
    return true
  })
  return changed
}
