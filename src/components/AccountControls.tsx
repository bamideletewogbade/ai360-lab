'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OrganizationSwitcher, Show, UserButton } from '@clerk/nextjs'
import { BillingSettingsModal } from '@/components/BillingSettingsModal'

const TEAM_WORKSPACES_ENABLED = process.env.NEXT_PUBLIC_AI360_TEAM_WORKSPACES === 'true'

export function AccountControls({ enabled }: { enabled: boolean }) {
  const [billingOpen, setBillingOpen] = useState(false)

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
        <button
          type="button"
          className="billing-trigger-btn"
          onClick={() => setBillingOpen(true)}
          title="View active plan & billing history"
          style={{
            background: 'var(--white, #fff)',
            border: '1px solid var(--line, #e2ded4)',
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 750,
            cursor: 'pointer',
            color: 'var(--black, #101112)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Billing
        </button>
        <UserButton
          appearance={{
            options: { shimmer: true },
            elements: { avatarBox: { width: 32, height: 32 }, userButtonTrigger: { transition: 'transform 180ms ease' } },
          }}
          showName={false}
        />
        <BillingSettingsModal isOpen={billingOpen} onClose={() => setBillingOpen(false)} />
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
