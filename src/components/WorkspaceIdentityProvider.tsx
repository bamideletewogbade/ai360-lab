'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type WorkspaceMemberIdentity = {
  userId: string
  workspaceScope: string
}

const WorkspaceIdentityContext = createContext<WorkspaceMemberIdentity | null>(null)

export function WorkspaceIdentityProvider({
  identity,
  children,
}: {
  identity: WorkspaceMemberIdentity | null
  children: ReactNode
}) {
  return <WorkspaceIdentityContext.Provider value={identity}>{children}</WorkspaceIdentityContext.Provider>
}

export function useWorkspaceIdentity() {
  return useContext(WorkspaceIdentityContext)
}
