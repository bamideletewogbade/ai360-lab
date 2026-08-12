import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import { isOnboardingGoal, isOnboardingRole, type OnboardingProfile } from '@/lib/onboarding'
import type { WorkspaceAuthContext } from '@/lib/workspace'

/**
 * Durable side of first-run personalization, on Supabase Postgres.
 *
 * The intake outcome is remembered per member so it follows a person to every
 * device they sign in on, rather than living only in one browser. It is keyed by
 * (workspace_key, owner_id): a personal workspace has a single member and so a
 * single row, while inside an organization each member keeps their own answer.
 * The client stays the fast path — it reads and writes its local cache first —
 * and reconciles with this store when signed in.
 */

export type OnboardingState =
  | { status: 'completed'; profile: OnboardingProfile }
  | { status: 'skipped' }
  | { status: 'none' }

export type OnboardingWrite =
  | { status: 'completed'; profile: OnboardingProfile }
  | { status: 'skipped' }

export async function readWorkspaceOnboarding(context: WorkspaceAuthContext): Promise<OnboardingState | null> {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<{ status: string; role: string | null; goal: string | null }[]>`
    select status, role, goal from public.lab_workspace_onboarding
     where workspace_key = ${context.workspace.key} and owner_id = ${context.userId}`
  if (!row) return { status: 'none' }
  if (row.status === 'completed' && isOnboardingRole(row.role) && isOnboardingGoal(row.goal)) {
    return { status: 'completed', profile: { role: row.role, goal: row.goal } }
  }
  if (row.status === 'skipped') return { status: 'skipped' }
  return { status: 'none' }
}

export async function writeWorkspaceOnboarding(
  context: WorkspaceAuthContext,
  input: OnboardingWrite,
): Promise<{ saved: boolean }> {
  if (!isPostgresConfigured()) return { saved: false }
  const role = input.status === 'completed' ? input.profile.role : null
  const goal = input.status === 'completed' ? input.profile.goal : null

  await getPostgres().begin(async (tx) => {
    await ensureWorkspaceRecord(tx, context)
    await tx`
      insert into public.lab_workspace_onboarding (workspace_key, owner_id, status, role, goal)
      values (${context.workspace.key}, ${context.userId}, ${input.status}, ${role}, ${goal})
      on conflict (workspace_key, owner_id) do update set
        status = excluded.status,
        role = excluded.role,
        goal = excluded.goal,
        updated_at = now()`
  })
  return { saved: true }
}
