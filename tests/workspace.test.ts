import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessWorkspace,
  createWorkspaceAuthContext,
  organizationWorkspace,
  personalWorkspace,
  resolveWorkspaceIdentity,
  sessionCanAccessWorkspace,
  scopedStorageKey,
} from '../src/lib/workspace.ts'

test('only a fully active auth session can enter a workspace', () => {
  assert.equal(sessionCanAccessWorkspace({
    userId: 'user_alpha',
    isAuthenticated: true,
    sessionStatus: 'active',
  }), true)
  assert.equal(sessionCanAccessWorkspace({
    userId: 'user_alpha',
    isAuthenticated: true,
    sessionStatus: 'pending',
  }), false)
  assert.equal(sessionCanAccessWorkspace({
    userId: 'user_alpha',
    isAuthenticated: false,
    sessionStatus: null,
  }), false)
  assert.equal(sessionCanAccessWorkspace({
    userId: 'user:spoofed',
    isAuthenticated: true,
    sessionStatus: 'active',
  }), false)
})

test('a signed-in user defaults to a personal workspace', () => {
  const context = createWorkspaceAuthContext({ userId: 'user_alpha' })

  assert.deepEqual(context.workspace, {
    key: 'user:user_alpha',
    type: 'user',
    subjectId: 'user_alpha',
  })
  assert.equal(context.orgId, null)
  assert.equal(context.orgRole, null)
})

test('an active organization becomes the authoritative workspace', () => {
  const context = createWorkspaceAuthContext({
    userId: 'user_alpha',
    orgId: 'org_acme',
    orgRole: 'org:admin',
  })

  assert.deepEqual(context.workspace, {
    key: 'org:org_acme',
    type: 'organization',
    subjectId: 'org_acme',
  })
  assert.equal(context.orgRole, 'org:admin')
})

test('workspace access is isolated to the active server-derived scope', () => {
  const personalAlpha = createWorkspaceAuthContext({ userId: 'user_alpha' })
  const organizationAcme = createWorkspaceAuthContext({ userId: 'user_alpha', orgId: 'org_acme' })

  assert.equal(canAccessWorkspace(personalAlpha, 'user:user_alpha'), true)
  assert.equal(canAccessWorkspace(personalAlpha, 'user:user_beta'), false)
  assert.equal(canAccessWorkspace(personalAlpha, 'org:org_acme'), false)
  assert.equal(canAccessWorkspace(organizationAcme, 'org:org_acme'), true)
  assert.equal(canAccessWorkspace(organizationAcme, 'org:org_other'), false)
  assert.equal(canAccessWorkspace(organizationAcme, 'user:user_alpha'), false)
})

test('workspace keys have distinct personal and organization namespaces', () => {
  assert.equal(personalWorkspace('shared_id').key, 'user:shared_id')
  assert.equal(organizationWorkspace('shared_id').key, 'org:shared_id')
  assert.equal(resolveWorkspaceIdentity('user_alpha', null).key, 'user:user_alpha')
  assert.equal(resolveWorkspaceIdentity('user_alpha', 'org_acme').key, 'org:org_acme')
})

test('invalid identity values cannot be turned into database scopes', () => {
  assert.throws(() => personalWorkspace('user:spoofed'), /Invalid user ID/)
  assert.throws(() => organizationWorkspace('org/acme'), /Invalid organization ID/)
  assert.throws(() => createWorkspaceAuthContext({ userId: '' }), /Invalid user ID/)
})

test('browser persistence is namespaced so switching workspaces cannot leak drafts', () => {
  const base = 'ai360-lab-conversations-v2'

  assert.equal(scopedStorageKey(base, 'guest'), base)
  assert.equal(scopedStorageKey(base, 'user:user_alpha'), `${base}:user:user_alpha`)
  assert.equal(scopedStorageKey(base, 'org:org_acme'), `${base}:org:org_acme`)
  assert.notEqual(
    scopedStorageKey(base, 'user:user_alpha'),
    scopedStorageKey(base, 'org:org_acme'),
  )
})
