import type { AdminInvitation } from '@/lib/admin/contracts'

export const ADMIN_INVITATIONS_PER_PAGE = 50

export function filterAdminInvitations(
  invitations: AdminInvitation[],
  input: { status: string; query: string },
) {
  const needle = input.query.trim().toLowerCase()
  return invitations.filter((invitation) => {
    const statusMatches = input.status === 'all'
      || (input.status === 'open' && (invitation.inviteStatus === 'pending' || invitation.inviteStatus === 'sent'))
      || invitation.inviteStatus === input.status
    const queryMatches = !needle
      || invitation.email.toLowerCase().includes(needle)
      || invitation.displayName?.toLowerCase().includes(needle)
    return statusMatches && Boolean(queryMatches)
  })
}

export function invitationPageCount(total: number, perPage = ADMIN_INVITATIONS_PER_PAGE) {
  return Math.max(1, Math.ceil(total / perPage))
}

export function paginateAdminInvitations(
  invitations: AdminInvitation[],
  page: number,
  perPage = ADMIN_INVITATIONS_PER_PAGE,
) {
  const pageCount = invitationPageCount(invitations.length, perPage)
  const safePage = Math.min(Math.max(1, page), pageCount)
  const start = (safePage - 1) * perPage
  return invitations.slice(start, start + perPage)
}
