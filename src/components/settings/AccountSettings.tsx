'use client'

import Link from 'next/link'
import { Show, UserProfile } from '@clerk/nextjs'
import styles from './Settings.module.css'

const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/**
 * Account management in one place.
 *
 * This used to be a tab holding two links while the real controls â€” profile,
 * email, password, sessions, sign out â€” lived only inside the avatar popover.
 * Clerk's own profile component is embedded here so "Account" means account.
 * The avatar menu stays in the workspace for quick sign-out, which is genuinely
 * a few-seconds task.
 *
 * `routing="hash"` keeps Clerk's internal navigation inside this single route
 * rather than requiring a catch-all segment.
 */
export function AccountSettings() {
  return (
    <>
      {AUTH_ENABLED ? (
        <>
          <Show when="signed-in">
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Identity &amp; security</h2>
                <p>Your profile, sign-in methods and active devices.</p>
              </div>
              <div className={styles.profileMount}>
                <UserProfile
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: { width: '100%' },
                      cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
                      card: { boxShadow: 'none', padding: 0 },
                    },
                  }}
                />
              </div>
            </section>
          </Show>
          <Show when="signed-out">
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Identity &amp; security</h2>
              </div>
              <p className={styles.notice}>
                You are exploring in guest mode. <Link href="/sign-in">Sign in</Link> or{' '}
                <Link href="/sign-up">create an account</Link> to keep your work on every device.
              </p>
            </section>
          </Show>
        </>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Identity &amp; security</h2>
          </div>
          <p className={styles.notice}>
            Account access is being connected. You can keep using AI360 as a guest in the meantime.
          </p>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Privacy &amp; terms</h2>
          <p>How your work is handled, and the terms you are using AI360 under.</p>
        </div>
        <p className={styles.notice}>
          Read our <Link href="/privacy">Privacy Notice</Link> and <Link href="/terms">Terms of Service</Link>.
          To report a problem or request deletion, use <Link href="/feedback">Help &amp; feedback</Link> in the workspace.
        </p>
      </section>
    </>
  )
}
