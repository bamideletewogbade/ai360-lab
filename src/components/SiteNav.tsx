'use client'

import Link from 'next/link'
import { Show, UserButton } from '@clerk/nextjs'
import { BrandMark } from '@/components/BrandMark'
import { PUBLIC_NAV_LINKS } from '@/lib/brand'

const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/**
 * The one navigation for every public page.
 *
 * It previously existed twice, once in the landing page and once in the pricing
 * page, which is how pricing ended up with fewer links, no sign-in and a
 * different call to action after the landing nav was made session aware.
 */
export type SiteNavCurrent = 'home' | 'what' | 'how' | 'pricing' | 'changelog' | 'legal'

export function SiteNav({ current = 'home' }: { current?: SiteNavCurrent }) {
  return (
    <nav className="landing-nav" aria-label="AI360 navigation">
      <Link href="/" className="landing-logo" aria-label="AI360 home">
        <BrandMark width={180} height={44} priority />
      </Link>
      {/* Top-of-funnel links are for prospects. A signed-in person has already
          arrived, so they get a workspace-focused nav instead of the pitch. */}
      {AUTH_ENABLED
        ? <Show when="signed-out"><MarketingLinks current={current} /></Show>
        : <MarketingLinks current={current} />}
      <SiteNavActions />
    </nav>
  )
}

function MarketingLinks({ current }: { current: SiteNavCurrent }) {
  return (
    <div className="landing-links">
      {PUBLIC_NAV_LINKS.map((link) => (
        link.external
          ? <a href={link.href} key={link.href}>{link.label}</a>
          : (
            <Link
              href={link.href}
              key={link.href}
              aria-current={link.current && link.current === current ? 'page' : undefined}
            >
              {link.label}
            </Link>
          )
      ))}
    </div>
  )
}

function SiteNavActions() {
  if (!AUTH_ENABLED) return <div className="landing-account-actions"><SignedOutActions /></div>

  return (
    <Show
      when="signed-in"
      fallback={<div className="landing-account-actions"><SignedOutActions /></div>}
    >
      <div className="landing-account-actions landing-account-signed-in">
        <span className="landing-user" aria-label="Your AI360 account">
          <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} showName={false} />
        </span>
      </div>
    </Show>
  )
}

function SignedOutActions() {
  return (
    <>
      <Link href="/sign-in" className="landing-sign-in">Sign in</Link>
      <Link href="/app" className="landing-open">Start free <span aria-hidden="true">â†—</span></Link>
    </>
  )
}
