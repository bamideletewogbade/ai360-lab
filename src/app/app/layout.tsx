import type { Metadata } from 'next'
import { WorkspaceIdentityProvider, type WorkspaceMemberIdentity } from '@/components/WorkspaceIdentityProvider'
import { getOptionalAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Workspace',
  robots: { index: false, follow: false },
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let identity: WorkspaceMemberIdentity | null = null
  try {
    const context = await getOptionalAuthContext()
    if (context) identity = { userId: context.userId, workspaceScope: context.workspace.key }
  } catch {
    // Authentication is an enhancement: a provider outage still opens guest chat.
  }

  return <WorkspaceIdentityProvider identity={identity}>{children}</WorkspaceIdentityProvider>
}
