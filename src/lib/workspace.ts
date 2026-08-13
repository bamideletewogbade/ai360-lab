export type WorkspaceType = 'user' | 'organization'

export type WorkspaceIdentity = {
  key: string
  type: WorkspaceType
  subjectId: string
}

export type WorkspaceAuthContext = {
  userId: string
  orgId: string | null
  orgRole: string | null
  profile: {
    email: string | null
    displayName: string | null
    imageUrl: string | null
  }
  workspace: WorkspaceIdentity
}

export type WorkspaceSessionClaims = {
  userId?: string | null
  isAuthenticated?: boolean
  sessionStatus?: 'active' | 'pending' | null
}

const AUTH_SUBJECT_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Pending auth sessions have not completed their required security tasks. */
export function sessionCanAccessWorkspace(session: WorkspaceSessionClaims) {
  return session.isAuthenticated === true
    && session.sessionStatus === 'active'
    && typeof session.userId === 'string'
    && AUTH_SUBJECT_ID.test(session.userId)
}

function validSubjectId(value: string, label: string) {
  if (!AUTH_SUBJECT_ID.test(value)) throw new Error(`Invalid ${label}`)
  return value
}

export function personalWorkspace(userId: string): WorkspaceIdentity {
  const subjectId = validSubjectId(userId, 'user ID')
  return { key: `user:${subjectId}`, type: 'user', subjectId }
}

export function organizationWorkspace(orgId: string): WorkspaceIdentity {
  const subjectId = validSubjectId(orgId, 'organization ID')
  return { key: `org:${subjectId}`, type: 'organization', subjectId }
}

export function resolveWorkspaceIdentity(userId: string, orgId?: string | null) {
  return orgId ? organizationWorkspace(orgId) : personalWorkspace(userId)
}

export function createWorkspaceAuthContext(input: {
  userId: string
  orgId?: string | null
  orgRole?: string | null
  email?: string | null
  displayName?: string | null
  imageUrl?: string | null
}): WorkspaceAuthContext {
  const userId = validSubjectId(input.userId, 'user ID')
  const orgId = input.orgId ? validSubjectId(input.orgId, 'organization ID') : null
  return {
    userId,
    orgId,
    orgRole: orgId ? input.orgRole || null : null,
    profile: {
      email: input.email || null,
      displayName: input.displayName || null,
      imageUrl: input.imageUrl || null,
    },
    workspace: resolveWorkspaceIdentity(userId, orgId),
  }
}

export function canAccessWorkspace(context: WorkspaceAuthContext, workspaceKey: string) {
  return context.workspace.key === workspaceKey
}

export function scopedStorageKey(baseKey: string, workspaceKey: string) {
  return workspaceKey === 'guest' ? baseKey : `${baseKey}:${workspaceKey}`
}
