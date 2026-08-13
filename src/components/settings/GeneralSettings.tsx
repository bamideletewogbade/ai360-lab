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
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Appearance</h2>
          <p>Choose how AI360 looks. System follows your device as it changes.</p>
        </div>
        <ThemeControl />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Language &amp; voice</h2>
          <p>The language AI360 prefers when you speak or ask for a reply.</p>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="preferred-language">Preferred spoken language</label>
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
