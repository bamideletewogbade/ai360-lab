import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import type { AdminInvitation } from '../src/lib/admin/contracts.ts'
import {
  ADMIN_INVITATIONS_PER_PAGE,
  filterAdminInvitations,
  invitationPageCount,
  paginateAdminInvitations,
} from '../src/lib/admin/invitation-list.ts'

function invitation(index: number, overrides: Partial<AdminInvitation> = {}): AdminInvitation {
  return {
    id: `invitation_${index}`,
    programKey: 'pilot',
    email: `person${index}@example.com`,
    displayName: `Person ${index}`,
    cohortKey: 'pilot-main',
    participationStatus: 'enrolled',
    startingCredits: 0,
    inviteStatus: 'sent',
    claimedUserId: null,
    invitedBy: 'operator_1',
    importKey: 'import_1',
    sentAt: '2026-09-01T00:00:00.000Z',
    acceptedAt: null,
    lastAttemptAt: '2026-09-01T00:00:00.000Z',
    sendAttempts: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

test('the invitation list uses the agreed 50-row page size', () => {
  const invitations = Array.from({ length: 121 }, (_, index) => invitation(index + 1))
  assert.equal(ADMIN_INVITATIONS_PER_PAGE, 50)
  assert.equal(invitationPageCount(invitations.length), 3)
  assert.equal(paginateAdminInvitations(invitations, 1).length, 50)
  assert.equal(paginateAdminInvitations(invitations, 2)[0].id, 'invitation_51')
  assert.equal(paginateAdminInvitations(invitations, 3).length, 21)
})

test('search finds an invitation beyond the first page by email or name', () => {
  const invitations = Array.from({ length: 130 }, (_, index) => invitation(index + 1))
  invitations[118] = invitation(119, { email: 'pilot.person@example.com', displayName: 'Ama Nyarko' })

  assert.deepEqual(
    filterAdminInvitations(invitations, { status: 'all', query: 'PILOT.PERSON' }).map((item) => item.id),
    ['invitation_119'],
  )
  assert.deepEqual(
    filterAdminInvitations(invitations, { status: 'all', query: 'nyar' }).map((item) => item.id),
    ['invitation_119'],
  )
})

test('invitation search and lifecycle status filters compose', () => {
  const invitations = [
    invitation(1, { displayName: 'Ama One', inviteStatus: 'sent' }),
    invitation(2, { displayName: 'Ama Two', inviteStatus: 'revoked' }),
    invitation(3, { displayName: 'Kojo', inviteStatus: 'pending' }),
  ]
  assert.deepEqual(
    filterAdminInvitations(invitations, { status: 'open', query: 'ama' }).map((item) => item.id),
    ['invitation_1'],
  )
  assert.deepEqual(
    filterAdminInvitations(invitations, { status: 'revoked', query: 'ama' }).map((item) => item.id),
    ['invitation_2'],
  )
})

test('cancelled invitation restoration is audited and exposed through the admin route', async () => {
  const repository = await readFile(new URL('../src/lib/admin/invitations.ts', import.meta.url), 'utf8')
  const route = await readFile(new URL('../src/app/api/admin/participants/route.ts', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../database/postgres/0031_restore_pilot_invitations.sql', import.meta.url), 'utf8')

  assert.match(repository, /invite_status = 'revoked'/)
  assert.match(repository, /set invite_status = 'pending'/)
  assert.match(repository, /'restored'/)
  assert.match(route, /z\.enum\(\['revoke', 'restore'\]\)/)
  assert.match(migration, /'restored'/)
})

test('a cancelled import is described as restorable instead of new', async () => {
  const contracts = await readFile(new URL('../src/lib/admin/contracts.ts', import.meta.url), 'utf8')
  const repository = await readFile(new URL('../src/lib/admin/invitations.ts', import.meta.url), 'utf8')
  assert.match(contracts, /previously_cancelled/)
  assert.match(repository, /existingInvitation\?\.invite_status === 'revoked'/)
})
