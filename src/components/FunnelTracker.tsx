'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  trackFunnelStep,
  captureInvitationId,
  invitationIdInUrl,
  hasSentStep,
} from '@/lib/funnel/client'
import { useAuth } from '@/components/AuthProvider'

/**
 * Fires the pre-activation funnel steps as a person moves through the site.
 *
 * Path-driven rather than sprinkled through the pages: the steps that matter
 * are "reached the site", "started signing up" and "opened the workspace", and
 * each of those is a route. Keeping the rule in one place means a page can be
 * redesigned without silently losing its measurement — the failure that makes a
 * funnel quietly report zeroes.
 *
 * `signup_completed` is not a route, because the auth callback redirects
 * straight past it. It is inferred instead: a browser that started signing up
 * and now holds a session has finished signing up. The endpoint refuses that
 * step without a real server session, so the inference cannot be faked.
 */
export function FunnelTracker() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  // The invitation id arrives on the landing URL and must be captured before
  // any navigation drops the query string. Its presence *in the URL* is itself
  // the first funnel step: it means this person opened the email and clicked.
  useEffect(() => {
    const arrivedByInvitation = invitationIdInUrl() !== null
    captureInvitationId()
    if (arrivedByInvitation) trackFunnelStep('invite_clicked')
  }, [])

  // A session now exists for a browser that started signing up, so the sign-up
  // finished. Independent of the route, because the callback lands the person
  // wherever they were headed rather than on a confirmation page.
  useEffect(() => {
    if (loading || !user) return
    if (hasSentStep('signup_started')) trackFunnelStep('signup_completed')
  }, [user, loading])

  useEffect(() => {
    if (!pathname) return

    if (pathname.startsWith('/sign-up') || pathname.startsWith('/sign-in')) {
      trackFunnelStep('signup_started')
      return
    }

    // Only counted once the session has resolved, so a signed-in person's
    // workspace entry is not recorded while auth is still unknown.
    if (pathname.startsWith('/app')) {
      if (!loading && user) trackFunnelStep('workspace_entered')
      return
    }

    trackFunnelStep('landing_viewed')
  }, [pathname, user, loading])

  return null
}
