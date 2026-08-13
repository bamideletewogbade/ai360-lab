import Link from 'next/link'
import { SettingsNav } from '@/components/settings/SettingsNav'
import styles from '@/components/settings/Settings.module.css'

export const metadata = {
  title: 'Settings | AI360',
  robots: { index: false, follow: false },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/app" className={styles.back}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Workspace
        </Link>
        <h1 className={styles.headerTitle}>Settings</h1>
      </header>

      <div className={styles.layout}>
        <SettingsNav />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
