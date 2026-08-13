'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SETTINGS_SECTIONS, settingsPath, type SettingsSection } from '@/lib/settings-sections'
import styles from './Settings.module.css'

/** Line-drawn section icons. Emoji read as inconsistent and machine-generated. */
function SectionIcon({ section }: { section: SettingsSection }) {
  const common = {
    viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
  }
  if (section === 'general') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    )
  }
  if (section === 'billing') {
    return (
      <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /></svg>
    )
  }
  return (
    <svg {...common}><path d="M12 2 4 5v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V5Z" /><path d="M9.2 12.2l2 2 3.6-4" /></svg>
  )
}

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => {
        const href = settingsPath(section.id)
        const active = pathname === href
        return (
          <Link
            key={section.id}
            href={href}
            className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <SectionIcon section={section.id} />
            <span className={styles.navLabel}>
              {section.label}
              <span className={styles.navDetail}>{section.detail}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
