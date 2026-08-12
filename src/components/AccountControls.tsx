'use client'

import Link from 'next/link'
import { OrganizationSwitcher, Show, UserButton } from '@clerk/nextjs'

const TEAM_WORKSPACES_ENABLED = process.env.NEXT_PUBLIC_AI360_TEAM_WORKSPACES === 'true'

/**
 * Identity only.
 *
 * Settings used to live here as a floating gear beside the avatar, which read as
 * a stray control in the top bar. It now lives in the sidebar next to Help, so
 * this component is just the person's identity: the guest badge, the workspace
 * switcher and the Clerk user menu (which already owns sign-out and account
 * management).
 */
export function AccountControls({ enabled }: { enabled: boolean }) {
  if (!enabled) return (
    <Link href="/sign-in" className="guest-badge" title="Sign in to save your work across devices">
      <span className="guest-status" /> Guest <b>Save work</b>
    </Link>
  )

  return (
    <div className="account-controls">
      <Show when="signed-out"><SignedOutControls /></Show>
      <Show when="signed-in">
        {TEAM_WORKSPACES_ENABLED ? (
          <OrganizationSwitcher
            hidePersonal={false}
            afterCreateOrganizationUrl="/app"
            afterSelectOrganizationUrl="/app"
            afterSelectPersonalUrl="/app"
            appearance={{ elements: { organizationSwitcherTrigger: { minHeight: 32 } } }}
          />
        ) : null}
        <UserButton
          appearance={{
            options: { shimmer: true },
            elements: { avatarBox: { width: 32, height: 32 }, userButtonTrigger: { transition: 'transform 180ms ease' } },
          }}
          showName={false}
        />
      </Show>
    </div>
  )
}

function SignedOutControls() {
  return (
    <div className="signed-out-controls">
      <Link href="/sign-in" className="auth-sign-in">Sign in</Link>
      <Link href="/sign-up" className="auth-sign-up">Save your work</Link>
    </div>
  )
}
