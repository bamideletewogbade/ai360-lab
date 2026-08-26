import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene7PilotOutro: React.FC = () => {
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
          padding: '48px 64px',
          boxShadow: '0 24px 70px rgba(16, 17, 18, 0.1)',
          maxWidth: 920,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* Brand Mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: COLORS.black,
              color: COLORS.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            360
          </div>
          <span style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, letterSpacing: '-0.04em' }}>
            AI360 <span style={{ color: COLORS.clay }}>Africa</span>
          </span>
        </div>

        <div>
          <h2 style={{ fontSize: 44, fontWeight: 900, color: COLORS.black, margin: '0 0 10px 0', letterSpacing: '-0.03em' }}>
            Ready to Test Your Own Goal?
          </h2>
          <p style={{ fontSize: 18, color: COLORS.charcoal, margin: 0, maxWidth: 640, lineHeight: 1.5 }}>
            Join the Private Pilot today. Run Ask, Research, and Build workflows for your business.
          </p>
        </div>

        {/* CTA Button */}
        <div
          style={{
            backgroundColor: COLORS.black,
            color: COLORS.white,
            padding: '16px 36px',
            borderRadius: 14,
            fontSize: 20,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 6px 20px rgba(16, 17, 18, 0.25)',
            transform: `scale(${buttonPulse})`,
          }}
        >
          <span>Start at</span>
          <span style={{ color: '#97d8be', textDecoration: 'underline' }}>ai360.africa</span>
          <span>→</span>
        </div>

        <div style={{ fontSize: 13, color: COLORS.grey, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>🇬🇭 Accra Innovation Centre</span>
          <span>·</span>
          <span>🔒 Verified Live Citations</span>
          <span>·</span>
          <span>⚡ No Hidden Fees</span>
        </div>
      </div>
    </div>
  )
}
