import { auth } from '@clerk/nextjs/server'
import { createWorkspaceAuthContext, type WorkspaceAuthContext } from '@/lib/workspace'

export function isAuthConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
}

export async function getOptionalAuthContext(): Promise<WorkspaceAuthContext | null> {
  if (!isAuthConfigured()) return null
  const session = await auth()
  if (!session.userId) return null
  return createWorkspaceAuthContext({
    userId: session.userId,
    orgId: session.orgId,
    orgRole: session.orgRole,
  })
}

export async function getOptionalUserId() {
  return (await getOptionalAuthContext())?.userId ?? null
}
