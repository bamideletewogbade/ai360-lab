'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Show, UserButton } from '@clerk/nextjs'

const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/**
 * The one navigation for every public page.
 *
 * It previously existed twice, once in the landing page and once in the pricing
 * page, which is how pricing ended up with fewer links, no sign-in and a
 * different call to action after the landing nav was made session aware.
 */
const LINKS: Array<{ href: string; label: string; current?: SiteNavCurrent; external?: boolean }> = [
  { href: '/what-you-can-make', label: 'What you can make', current: 'what' },
  { href: '/how-it-works', label: 'How it works', current: 'how' },
  { href: '/pricing', label: 'Pricing', current: 'pricing' },
  { href: 'https://aithreesixty.tech', label: 'AI 360 home', external: true },
]

export type SiteNavCurrent = 'home' | 'what' | 'how' | 'pricing' | 'legal'

export function SiteNav({ current = 'home' }: { current?: SiteNavCurrent }) {
  return (
    <nav className="landing-nav" aria-label="AI 360 Lab navigation">
      <Link href="/" className="landing-logo" aria-label="AI 360 Lab home">
        <Image src="/logo-black.png" width={180} height={44} alt="AI Three Sixty" priority />
        <span>LAB</span>
      </Link>
      <div className="landing-links">
        {LINKS.map((link) => (
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
      <SiteNavActions />
    </nav>
  )
}

function SiteNavActions() {
  if (!AUTH_ENABLED) return <div className="landing-account-actions"><SignedOutActions /></div>

  return (
    <div className="landing-account-actions">
      <Show when="signed-in" fallback={<SignedOutActions />}>
        <span className="landing-user" aria-label="Your AI 360 account">
          <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} showName={false} />
        </span>
        <Link href="/app" className="landing-open">Open workspace <span aria-hidden="true">↗</span></Link>
      </Show>
    </div>
  )
}

function SignedOutActions() {
  return (
    <>
      <Link href="/sign-in" className="landing-sign-in">Sign in</Link>
      <Link href="/app" className="landing-open">Try AI 360 <span aria-hidden="true">↗</span></Link>
    </>
  )
}
