import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene6PilotCTA: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 10, SPRINGS.bouncy)
  const buttonPulse = Math.sin(frame / 12) * 0.04 + 1

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: COLORS.warmWhite,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 60px',
        textAlign: 'center',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          transform: `scale(${cardScale})`,
          backgroundColor: COLORS.white,
          borderRadius: 24,
          border: `1.5px solid ${COLORS.lineDark}`,
          padding: '50px 70px',
          boxShadow: '0 24px 70px rgba(16, 17, 18, 0.1)',
          maxWidth: 960,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 26,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: COLORS.black,
              color: COLORS.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            360
          </div>
          <span style={{ fontSize: 32, fontWeight: 900, color: COLORS.black, letterSpacing: '-0.04em' }}>
            AI360 <span style={{ color: COLORS.clay }}>Africa</span>
          </span>
        </div>

        <div>
          <h2 style={{ fontSize: 46, fontWeight: 900, color: COLORS.black, margin: '0 0 12px 0', letterSpacing: '-0.03em' }}>
            Try AI360 Africa in the Private Pilot
          </h2>
          <p style={{ fontSize: 19, color: COLORS.charcoal, margin: 0, maxWidth: 660, lineHeight: 1.5 }}>
            Run Chats, Projects, Media Studio & Tools for your research, business, or studies.
          </p>
        </div>

        {/* CTA Button */}
        <div
          style={{
            backgroundColor: COLORS.black,
            color: COLORS.white,
            padding: '18px 40px',
            borderRadius: 14,
            fontSize: 22,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 8px 24px rgba(16, 17, 18, 0.25)',
            transform: `scale(${buttonPulse})`,
          }}
        >
          <span>Get Started at</span>
          <span style={{ color: '#97d8be', textDecoration: 'underline' }}>ai360.africa</span>
          <span>→</span>
        </div>

        <div style={{ fontSize: 14, color: COLORS.grey, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>🇬🇭 Accra Innovation Centre</span>
          <span>·</span>
          <span>🔒 Verified Citations</span>
          <span>·</span>
          <span>⚡ Zero Silent Costs</span>
        </div>
      </div>
    </div>
  )
}
