'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { BrandMark } from '@/components/BrandMark'
import { PUBLIC_NAV_LINKS } from '@/lib/brand'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'

const AUTH_ENABLED = isSupabaseAuthConfigured()

/**
 * The one navigation for every public page.
 *
 * It previously existed twice, once in the landing page and once in the pricing
 * page, which is how pricing ended up with fewer links, no sign-in and a
 * different call to action after the landing nav was made session aware.
 */
export type SiteNavCurrent = 'home' | 'what' | 'how' | 'pricing' | 'changelog' | 'legal'

export function SiteNav({ current = 'home' }: { current?: SiteNavCurrent }) {
  const { user } = useAuth()

  return (
    <nav className="landing-nav" aria-label="AI360 navigation">
      <Link href="/" className="landing-logo" aria-label="AI360 home">
        <BrandMark width={180} height={44} priority />
      </Link>
      {/* Top-of-funnel links are for prospects. A signed-in person has already
          arrived, so they get a workspace-focused nav instead of the pitch. */}
      {user ? null : <MarketingLinks current={current} />}
      <SiteNavActions signedIn={Boolean(user)} />
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

function SiteNavActions({ signedIn }: { signedIn: boolean }) {
  if (!AUTH_ENABLED) return <div className="landing-account-actions"><SignedOutActions /></div>

  return signedIn ? (
    <div className="landing-account-actions landing-account-signed-in">
      <Link href="/app" className="landing-open">Open workspace</Link>
    </div>
  ) : (
    <div className="landing-account-actions"><SignedOutActions /></div>
  )
}

function SignedOutActions() {
  return (
    <>
      <Link href="/sign-in" className="landing-sign-in">Sign in</Link>
      <Link href="/sign-up" className="landing-open">Sign up</Link>
    </>
  )
}
