/**
 * Shared layout primitives for the AI360 pilot campaign.
 *
 * Everything is sized in `u` units so the same component renders correctly at
 * 9:16, 1:1 and 16:9 without a separate layout per format. 1u is derived from
 * the shorter edge of the canvas, so type stays optically the same size in
 * every crop.
 */

import React from 'react'
import { useVideoConfig } from 'remotion'
import { COLORS } from '../theme'
import { CTA_URL } from './audiences'

export const FONT_STACK = '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif'

/** 1u === 1px at a 1080-short-edge canvas. */
export function useU(): number {
  const { width, height } = useVideoConfig()
  return Math.min(width, height) / 1080
}

export const Stage: React.FC<{
  children: React.ReactNode
  background?: string
  align?: 'center' | 'flex-start'
  gap?: number
}> = ({ children, background = COLORS.warmWhite, align = 'center', gap = 0 }) => {
  const u = useU()
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: align === 'center' ? 'center' : 'left',
        padding: `${72 * u}px ${72 * u}px`,
        fontFamily: FONT_STACK,
        position: 'relative',
        gap: gap * u,
      }}
    >
      {children}
    </div>
  )
}

export const Eyebrow: React.FC<{ text: string; accent: string; style?: React.CSSProperties }> = ({
  text,
  accent,
  style,
}) => {
  const u = useU()
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10 * u,
        backgroundColor: COLORS.white,
        border: `${1.5 * u}px solid ${COLORS.lineDark}`,
        padding: `${9 * u}px ${24 * u}px`,
        borderRadius: 999,
        boxShadow: `0 ${4 * u}px ${16 * u}px rgba(16, 17, 18, 0.06)`,
        ...style,
      }}
    >
      <span style={{ width: 7 * u, height: 7 * u, borderRadius: '50%', backgroundColor: accent }} />
      <span
        style={{
          fontSize: 17 * u,
          fontWeight: 900,
          color: COLORS.black,
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  )
}

export const BrandLockup: React.FC<{ size?: number; muted?: boolean }> = ({
  size = 1,
  muted = false,
}) => {
  const u = useU() * size
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u }}>
      <div
        style={{
          width: 46 * u,
          height: 46 * u,
          borderRadius: 13 * u,
          backgroundColor: COLORS.black,
          color: COLORS.white,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: 20 * u,
          letterSpacing: '-0.02em',
        }}
      >
        360
      </div>
      <span
        style={{
          fontSize: 32 * u,
          fontWeight: 900,
          color: muted ? COLORS.charcoal : COLORS.black,
          letterSpacing: '-0.04em',
        }}
      >
        AI360 <span style={{ color: COLORS.clay }}>Africa</span>
      </span>
    </div>
  )
}

/** The one thing every asset in the campaign ends on. */
/** Arrow tint that stays legible on the black CTA button in every variant. */
const CTA_ARROW = '#97d8be'

export const CtaBlock: React.FC<{
  line: string
  accent?: string
  scale?: number
  pulse?: number
}> = ({ line, scale = 1, pulse = 1 }) => {
  const u = useU() * scale
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18 * u,
      }}
    >
      <div
        style={{
          fontSize: 26 * u,
          fontWeight: 800,
          color: COLORS.charcoal,
          letterSpacing: '-0.01em',
        }}
      >
        {line}
      </div>
      <div
        style={{
          backgroundColor: COLORS.black,
          color: COLORS.white,
          padding: `${20 * u}px ${44 * u}px`,
          borderRadius: 16 * u,
          fontSize: 34 * u,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: 14 * u,
          boxShadow: `0 ${10 * u}px ${28 * u}px rgba(16, 17, 18, 0.25)`,
          transform: `scale(${pulse})`,
        }}
      >
        <span>{CTA_URL}</span>
        <span style={{ color: CTA_ARROW }}>→</span>
      </div>
      <div
        style={{
          fontSize: 18 * u,
          color: COLORS.grey,
          fontWeight: 600,
          maxWidth: 620 * u,
          lineHeight: 1.45,
        }}
      >
        Sign up free and you are added to the pilot group.
      </div>
    </div>
  )
}

export const FooterStrip: React.FC = () => {
  const u = useU()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14 * u,
        fontSize: 16 * u,
        color: COLORS.grey,
        fontWeight: 600,
      }}
    >
      <span>🇬🇭 Accra Innovation Centre</span>
      <span>·</span>
      <span>🔒 Verified citations</span>
      <span>·</span>
      <span>⚡ Zero silent costs</span>
    </div>
  )
}
