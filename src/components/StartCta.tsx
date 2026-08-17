'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { workspaceHref } from '@/lib/brand'

/**
 * The one call to action that opens the workspace.
 *
 * Before this existed, eight different labels pointed at /app — "Take the first
 * step", "Start with your goal", "Start with a goal", "Start now", "Try it
 * now", "Open AI360", "Open workspace", "Continue as a guest" — each written by
 * hand in its own file. That is also how the landing page ended up with two
 * affordances that looked identical and behaved differently: the hero submitted
 * the goal immediately while the outcome cards only prefilled it. One component
 * owns the verb, the destination and that send-or-prefill decision, so they
 * cannot drift apart again.
 *
 * The label is state aware because the two audiences want opposite things. A
 * prospect needs to know it costs nothing to begin; someone already signed in
 * has been sold and just wants the door.
 */
export function startCtaLabel(signedIn: boolean) {
  return signedIn ? 'Open workspace' : 'Start free'
}

export function StartCta({
  className,
  prompt,
  mode,
  children,
}: {
  className?: string
  /** Pre-written words land in the composer for the person to finish. */
  prompt?: string
  mode?: 'chat' | 'agent' | 'studio'
  /** Override only where the surrounding sentence already carries the verb. */
  children?: React.ReactNode
}) {
  const { user } = useAuth()
  return (
    <Link href={workspaceHref(prompt, mode)} className={className}>
      {children ?? startCtaLabel(Boolean(user))}
    </Link>
  )
}
