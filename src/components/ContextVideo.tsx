'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './ContextVideo.module.css'

type ContextVideoProps = {
  src: string
  poster: string
  title: string
  caption: string
  eyebrow?: string
  className?: string
  overlayLabel?: string
  overlaySubline?: string
}

export function ContextVideo({ src, poster, title, caption, eyebrow = 'Studio outcome', className = '', overlayLabel, overlaySubline }: ContextVideoProps) {
  const frameRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [nearby, setNearby] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [manualPlay, setManualPlay] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setReducedMotion(preference.matches)
    syncPreference()
    preference.addEventListener('change', syncPreference)

    const frame = frameRef.current
    const observer = frame
      ? new IntersectionObserver(([entry]) => {
          setNearby(entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight * 1.5)
          setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35)
        }, { rootMargin: '280px 0px', threshold: [0, 0.35] })
      : null
    if (frame && observer) observer.observe(frame)

    return () => {
      preference.removeEventListener('change', syncPreference)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const shouldPlay = nearby && visible && (!reducedMotion || manualPlay)
    if (shouldPlay) void video.play().catch(() => undefined)
    else video.pause()
  }, [manualPlay, nearby, reducedMotion, visible])

  function playWithIntent() {
    setManualPlay(true)
  }

  const attachSource = nearby || manualPlay

  return (
    <figure ref={frameRef} className={`${styles.frame} ${className}`.trim()}>
      <div className={styles.viewport}>
        <video
          ref={videoRef}
          aria-label={title}
          poster={poster}
          muted
          loop
          playsInline
          controls={attachSource}
          preload="none"
        >
          {attachSource ? <source src={src} type="video/mp4" /> : null}
        </video>
        {overlayLabel ? <span className={styles.brandPlate}><b>{overlayLabel}</b><small>{overlaySubline}</small></span> : null}
        {!attachSource || (reducedMotion && !manualPlay) ? (
          <button type="button" className={styles.play} onClick={playWithIntent} aria-label={`Play ${title}`}>
            <span aria-hidden="true">▶</span> Play 4-second reel
          </button>
        ) : null}
        <span className={styles.format}>4 sec · silent · 9:16</span>
      </div>
      <figcaption>
        <span>{eyebrow}</span>
        <b>{title}</b>
        <p>{caption}</p>
      </figcaption>
    </figure>
  )
}
