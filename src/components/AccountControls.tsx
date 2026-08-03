'use client'

import Link from 'next/link'
import { OrganizationSwitcher, Show, UserButton } from '@clerk/nextjs'

const TEAM_WORKSPACES_ENABLED = process.env.NEXT_PUBLIC_AI360_TEAM_WORKSPACES === 'true'

export function AccountControls({ enabled }: { enabled: boolean }) {
  if (!enabled) return <span className="guest-badge" title="Authentication is not configured yet">Guest</span>

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
          appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}
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
      <Link href="/sign-up" className="auth-sign-up">Create account</Link>
    </div>
  )
}
