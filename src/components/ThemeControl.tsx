'use client'

import { useEffect, useState } from 'react'
import {
  applyResolvedTheme, DEFAULT_THEME_CHOICE, isThemeChoice, resolveTheme, THEME_STORAGE_KEY,
  type ThemeChoice,
} from '@/lib/theme'

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
  </svg>
)

const OPTIONS: { id: ThemeChoice; label: string; icon: () => React.ReactElement }[] = [
  { id: 'light', label: 'Light', icon: SunIcon },
  { id: 'system', label: 'System', icon: MonitorIcon },
  { id: 'dark', label: 'Dark', icon: MoonIcon },
]

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/**
 * Light / System / Dark selector. Writes the choice to localStorage and applies
 * it immediately; the no-flash script in the document head restores it on the
 * next load. In System mode it keeps following the OS as it changes.
 */
export function ThemeControl() {
  // Matches the head script's default, so the control never shows a selection
  // that disagrees with the theme actually painted.
  const [choice, setChoice] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE)

  useEffect(() => {
    // Sync the control to the stored choice after mount. It starts at 'system'
    // to match the server render, then adopts the saved value on the client,
    // which is the standard way to read localStorage without a hydration clash.
    let stored: string | null = null
    try { stored = localStorage.getItem(THEME_STORAGE_KEY) } catch { stored = null }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isThemeChoice(stored)) setChoice(stored)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (choice === 'system') applyResolvedTheme(resolveTheme('system', media.matches)) }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])

  const select = (next: ThemeChoice) => {
    setChoice(next)
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* choice is best-effort */ }
    applyResolvedTheme(resolveTheme(next, prefersDark()))
  }

  return (
    <div className="theme-control" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = choice === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-option${active ? ' active' : ''}`}
            onClick={() => select(option.id)}
          >
            <Icon />
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
