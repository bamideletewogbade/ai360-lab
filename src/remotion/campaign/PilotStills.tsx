/**
 * AI360 Africa — Pilot campaign static assets.
 *
 * Rendered as Remotion <Still /> compositions so the posters and carousel
 * frames come out of the same brand system, tokens and copy source as the
 * video. No springs here — a Still always sits on frame 0, so everything is
 * laid out statically.
 *
 *   PilotPoster    1080×1350  one image per audience
 *   PilotCarousel  1080×1350  frames 0–4 per audience (index prop)
 */

import React from 'react'
import { COLORS } from '../theme'
import { AUDIENCES, AudienceId, CTA_URL } from './audiences'
import { BrandLockup, FONT_STACK, FooterStrip, useU } from './kit'

/* ------------------------------------------------------------------ poster */

/** A type, not an interface — see the note on `PilotAdProps`. */
export type PilotPosterProps = {
  audience: AudienceId
}

export const PilotPoster: React.FC<PilotPosterProps> = ({ audience }) => {
  const a = AUDIENCES[audience]
  const u = useU()

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: COLORS.warmWhite,
        fontFamily: FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${64 * u}px ${60 * u}px`,
        position: 'relative',
      }}
    >
      {/* accent rail */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 14 * u,
          backgroundColor: a.accent,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 * u }}>
        <BrandLockup size={0.9} />
        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 10 * u,
            backgroundColor: a.accentBg,
            border: `${1.5 * u}px solid ${a.accent}`,
            borderRadius: 999,
            padding: `${9 * u}px ${22 * u}px`,
          }}
        >
          <span
            style={{
              fontSize: 17 * u,
              fontWeight: 900,
              letterSpacing: '0.06em',
              color: a.accent,
            }}
          >
            {a.eyebrow}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * u }}>
        <h1
          style={{
            fontSize: 76 * u,
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.045em',
            color: COLORS.black,
            margin: 0,
          }}
        >
          {a.headline}
        </h1>
        <p
          style={{
            fontSize: 28 * u,
            fontWeight: 600,
            lineHeight: 1.45,
            color: COLORS.charcoal,
            margin: 0,
            maxWidth: 820 * u,
          }}
        >
          {a.subhead}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * u, marginTop: 6 * u }}>
          {a.proof.map((item) => (
            <div key={item.title} style={{ display: 'flex', alignItems: 'center', gap: 14 * u }}>
              <span style={{ fontSize: 26 * u }}>{item.icon}</span>
              <span style={{ fontSize: 24 * u, fontWeight: 800, color: COLORS.black }}>
                {item.title}
              </span>
              <span style={{ fontSize: 21 * u, color: COLORS.grey }}>— {item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 * u }}>
        <div
          style={{
            backgroundColor: COLORS.black,
            borderRadius: 20 * u,
            padding: `${28 * u}px ${34 * u}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8 * u,
          }}
        >
          <span style={{ fontSize: 21 * u, fontWeight: 700, color: '#b8babd' }}>
            Pilot testing · limited seats
          </span>
          <span
            style={{
              fontSize: 46 * u,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: '-0.03em',
            }}
          >
            Sign up at {CTA_URL} <span style={{ color: '#97d8be' }}>→</span>
          </span>
          <span style={{ fontSize: 20 * u, color: '#9b9d9f' }}>
            Free account. Pilot testers added automatically.
          </span>
        </div>
        <FooterStrip />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- carousel */

/** A type, not an interface — see the note on `PilotAdProps`. */
export type PilotCarouselProps = {
  audience: AudienceId
  index: number
}

export const PilotCarousel: React.FC<PilotCarouselProps> = ({ audience, index }) => {
  const a = AUDIENCES[audience]
  const u = useU()
  const total = a.carousel.length
  const safeIndex = Math.max(0, Math.min(index, total - 1))
  const slide = a.carousel[safeIndex]
  const isLast = safeIndex === total - 1

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: isLast ? COLORS.black : COLORS.warmWhite,
        color: isLast ? COLORS.white : COLORS.black,
        fontFamily: FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${68 * u}px ${62 * u}px`,
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 19 * u,
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: isLast ? '#97d8be' : a.accent,
          }}
        >
          {slide.kicker}
        </span>
        <span
          style={{
            fontSize: 19 * u,
            fontWeight: 800,
            color: isLast ? '#9b9d9f' : COLORS.grey,
          }}
        >
          {safeIndex + 1} / {total}
        </span>
      </div>

      {/* body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 * u }}>
        <div
          style={{
            width: 88 * u,
            height: 8 * u,
            borderRadius: 999,
            backgroundColor: isLast ? '#97d8be' : a.accent,
          }}
        />
        <h2
          style={{
            fontSize: 72 * u,
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: '-0.045em',
            margin: 0,
          }}
        >
          {slide.headline}
        </h2>
        <p
          style={{
            fontSize: 30 * u,
            fontWeight: 500,
            lineHeight: 1.45,
            margin: 0,
            color: isLast ? '#d7d8d9' : COLORS.charcoal,
            maxWidth: 860 * u,
          }}
        >
          {slide.body}
        </p>
      </div>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u }}>
          <div
            style={{
              width: 42 * u,
              height: 42 * u,
              borderRadius: 12 * u,
              backgroundColor: isLast ? COLORS.white : COLORS.black,
              color: isLast ? COLORS.black : COLORS.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 18 * u,
            }}
          >
            360
          </div>
          <span style={{ fontSize: 26 * u, fontWeight: 900, letterSpacing: '-0.03em' }}>
            AI360 <span style={{ color: COLORS.clayLight }}>Africa</span>
          </span>
        </div>
        <span
          style={{
            fontSize: 24 * u,
            fontWeight: 800,
            color: isLast ? '#97d8be' : COLORS.grey,
          }}
        >
          {CTA_URL}
        </span>
      </div>
    </div>
  )
}
