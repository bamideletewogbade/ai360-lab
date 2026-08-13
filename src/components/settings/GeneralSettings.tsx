'use client'

import { useEffect, useState } from 'react'
import { ThemeControl } from '@/components/ThemeControl'
import styles from './Settings.module.css'

const LANGUAGE_KEY = 'ai360_preferred_lang'

const LANGUAGES = [
  { id: 'en', label: 'English (Ghana)' },
  { id: 'ak', label: 'Akan / Twi' },
  { id: 'ee', label: 'Ewe' },
  { id: 'ga', label: 'Ga' },
  { id: 'pcm', label: 'Ghanaian Pidgin' },
]

export function GeneralSettings() {
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(LANGUAGE_KEY) } catch { saved = null }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && LANGUAGES.some((item) => item.id === saved)) setLanguage(saved)
  }, [])

  const choose = (value: string) => {
    setLanguage(value)
    try { localStorage.setItem(LANGUAGE_KEY, value) } catch { /* preference is best-effort */ }
  }

  return (
    <>
      {/* Simple preferences read faster as a list than as a stack of cards:
          the setting on the left, its control on the right, one per line. A
          hint only appears where the setting is not self-explanatory. */}
      <section className={styles.card}>
        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>
            <strong>Appearance</strong>
            <span>System follows your device as it changes</span>
          </div>
          <ThemeControl />
        </div>

        <div className={styles.settingRow}>
          <label className={styles.settingLabel} htmlFor="preferred-language">
            <strong>Language</strong>
            <span>Preferred for speaking and replies</span>
          </label>
          <select
            id="preferred-language"
            className={styles.select}
            value={language}
            onChange={(event) => choose(event.target.value)}
          >
            {LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Workspace behaviour</h2>
        </div>
        <p className={styles.notice}>
          AI360 estimates credit usage before intensive tasks and keeps project drafts ready while you work.
        </p>
      </section>
    </>
  )
}
