/**
 * AI360 Africa — Pilot recruitment ad.
 *
 * 20s / 600 frames @ 30fps. One component, driven by an audience id, rendered
 * at 9:16, 1:1 and 16:9. Four beats:
 *   1. Hook        (0.0 – 4.0s)  the problem in the viewer's own words
 *   2. Product     (4.0 – 10.0s) three concrete things they will do
 *   3. Pilot offer (10.0 – 15.0s) what a pilot tester gives and gets
 *   4. CTA         (15.0 – 20.0s) sign up at ai360.africa
 */

import React from 'react'
import { interpolate, Series, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'
import { AUDIENCES, AudienceId } from './audiences'
import { BrandLockup, CtaBlock, Eyebrow, FooterStrip, Stage, useU } from './kit'

export const PILOT_AD_DURATION = 600

/**
 * A type alias rather than an interface, deliberately. Remotion constrains a
 * composition's props to `Record<string, unknown>`, and an interface gets no
 * implicit index signature — so declaring this as one makes it fail that
 * constraint, the generic falls back to its default, and `Root.tsx` fails to
 * type check with an error that points at the composition rather than here.
 */
export type PilotAdProps = {
  audience: AudienceId
}

/* ------------------------------------------------------------------ beat 1 */

const BeatHook: React.FC<PilotAdProps> = ({ audience }) => {
  const a = AUDIENCES[audience]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const u = useU()

  const badge = customSpring(frame, fps, 0, SPRINGS.snappy)
  const rise = customSpring(frame, fps, 8, SPRINGS.smooth)
  const lift = interpolate(rise, [0, 1], [40 * u, 0])
  const brand = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <Stage gap={40}>
      <div style={{ transform: `scale(${badge})` }}>
        <Eyebrow text={a.eyebrow} accent={a.accent} />
      </div>

      <h1
        style={{
          opacity: rise,
          transform: `translateY(${lift}px)`,
          fontSize: 72 * u,
          fontWeight: 900,
          color: COLORS.black,
          lineHeight: 1.12,
          letterSpacing: '-0.045em',
          margin: 0,
          maxWidth: 940 * u,
        }}
      >
        {a.hook}
      </h1>

      <div style={{ opacity: brand }}>
        <BrandLockup size={0.85} muted />
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ beat 2 */

const BeatProduct: React.FC<PilotAdProps> = ({ audience }) => {
  const a = AUDIENCES[audience]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const u = useU()

  const head = customSpring(frame, fps, 0, SPRINGS.smooth)

  return (
    <Stage gap={44}>
      <div style={{ transform: `scale(${head})`, maxWidth: 980 * u }}>
        <h2
          style={{
            fontSize: 58 * u,
            fontWeight: 900,
            color: COLORS.black,
            lineHeight: 1.15,
            letterSpacing: '-0.04em',
            margin: `0 0 ${14 * u}px 0`,
          }}
        >
          {a.headline}
        </h2>
        <p
          style={{
            fontSize: 26 * u,
            fontWeight: 700,
            color: a.accent,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {a.subhead}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16 * u,
          width: '100%',
          maxWidth: 820 * u,
        }}
      >
        {a.proof.map((item, i) => {
          const s = customSpring(frame, fps, 24 + i * 14, SPRINGS.bouncy)
          return (
            <div
              key={item.title}
              style={{
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [28 * u, 0])}px)`,
                backgroundColor: COLORS.white,
                border: `${1 * u}px solid ${COLORS.line}`,
                borderLeft: `${5 * u}px solid ${a.accent}`,
                borderRadius: 16 * u,
                padding: `${20 * u}px ${26 * u}px`,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 20 * u,
                boxShadow: `0 ${6 * u}px ${20 * u}px rgba(16, 17, 18, 0.05)`,
              }}
            >
              <span style={{ fontSize: 34 * u }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 26 * u, fontWeight: 900, color: COLORS.black, letterSpacing: '-0.02em' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 19 * u, color: COLORS.grey, marginTop: 4 * u, lineHeight: 1.4 }}>
                  {item.detail}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ beat 3 */

const BeatPilot: React.FC<PilotAdProps> = ({ audience }) => {
  const a = AUDIENCES[audience]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const u = useU()

  const card = customSpring(frame, fps, 4, SPRINGS.bouncy)

  return (
    <Stage background={a.accentBg} gap={36}>
      <div style={{ transform: `scale(${card})` }}>
        <Eyebrow text="PILOT TESTING · LIMITED SEATS" accent={a.accent} />
      </div>

      <h2
        style={{
          transform: `scale(${card})`,
          fontSize: 62 * u,
          fontWeight: 900,
          color: COLORS.black,
          letterSpacing: '-0.045em',
          lineHeight: 1.12,
          margin: 0,
          maxWidth: 900 * u,
        }}
      >
        We are opening it up early
      </h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14 * u,
          width: '100%',
          maxWidth: 720 * u,
        }}
      >
        {a.pilotOffer.map((line, i) => {
          const s = customSpring(frame, fps, 20 + i * 12, SPRINGS.snappy)
          return (
            <div
              key={line}
              style={{
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-26 * u, 0])}px)`,
                backgroundColor: COLORS.white,
                borderRadius: 14 * u,
                border: `${1 * u}px solid ${COLORS.line}`,
                padding: `${18 * u}px ${26 * u}px`,
                display: 'flex',
                alignItems: 'center',
                gap: 16 * u,
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 30 * u,
                  height: 30 * u,
                  borderRadius: '50%',
                  backgroundColor: a.accent,
                  color: COLORS.white,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17 * u,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <span style={{ fontSize: 26 * u, fontWeight: 800, color: COLORS.black, letterSpacing: '-0.02em' }}>
                {line}
              </span>
            </div>
          )
        })}
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ beat 4 */

const BeatCta: React.FC<PilotAdProps> = ({ audience }) => {
  const a = AUDIENCES[audience]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const u = useU()

  const card = customSpring(frame, fps, 6, SPRINGS.bouncy)
  const pulse = 1 + Math.sin(frame / 11) * 0.035

  return (
    <Stage gap={0}>
      <div
        style={{
          transform: `scale(${card})`,
          backgroundColor: COLORS.white,
          borderRadius: 28 * u,
          border: `${1.5 * u}px solid ${COLORS.lineDark}`,
          padding: `${52 * u}px ${56 * u}px`,
          boxShadow: `0 ${24 * u}px ${70 * u}px rgba(16, 17, 18, 0.1)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 30 * u,
          maxWidth: 900 * u,
        }}
      >
        <BrandLockup />
        <h2
          style={{
            fontSize: 48 * u,
            fontWeight: 900,
            color: COLORS.black,
            letterSpacing: '-0.04em',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {a.ctaLine}
        </h2>
        <CtaBlock line={`For ${a.label.toLowerCase()}`} accent={a.accent} pulse={pulse} />
        <FooterStrip />
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------- movie */

export const PilotAd: React.FC<PilotAdProps> = ({ audience }) => {
  return (
    <Series>
      <Series.Sequence durationInFrames={120}>
        <BeatHook audience={audience} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180}>
        <BeatProduct audience={audience} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150}>
        <BeatPilot audience={audience} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150}>
        <BeatCta audience={audience} />
      </Series.Sequence>
    </Series>
  )
}
