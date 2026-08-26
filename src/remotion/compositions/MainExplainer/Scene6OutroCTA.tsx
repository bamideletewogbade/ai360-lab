import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { BackgroundMesh } from '../../components/BackgroundMesh'
import { BrandLogo } from '../../components/BrandLogo'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene6OutroCTA: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 10, SPRINGS.bouncy)
  const buttonPulse = Math.sin(frame / 12) * 0.05 + 1

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 40px',
      }}
    >
      <BackgroundMesh intensity={1.3} />

      <div
        style={{
          transform: `scale(${cardScale})`,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          backgroundColor: 'rgba(20, 24, 28, 0.85)',
          borderRadius: 28,
          border: `1.5px solid ${COLORS.borderActive}`,
          padding: '44px 60px',
          boxShadow: `0 30px 90px rgba(0,0,0,0.8), 0 0 60px ${COLORS.greenGlow}`,
          maxWidth: 900,
        }}
      >
        <BrandLogo size="lg" showTagline={false} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: COLORS.white,
              margin: 0,
              letterSpacing: '-0.03em',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Join the{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${COLORS.greenLight}, ${COLORS.clayLight})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Private Pilot Test
            </span>
          </h2>

          <p
            style={{
              fontSize: 20,
              color: COLORS.textMuted,
              maxWidth: 650,
              lineHeight: 1.5,
              margin: '0 auto',
            }}
          >
            Experience practical AI workflows built for African entrepreneurs, teams, and creators.
          </p>
        </div>

        {/* CTA Button & URL Lockup */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              backgroundColor: COLORS.green,
              color: COLORS.white,
              padding: '16px 36px',
              borderRadius: 16,
              fontSize: 20,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: `0 8px 30px ${COLORS.greenGlow}`,
              transform: `scale(${buttonPulse})`,
            }}
          >
            <span>Start Free at</span>
            <span style={{ color: '#d9f5e5', textDecoration: 'underline' }}>ai360.africa</span>
            <span>→</span>
          </div>

          <div
            style={{
              fontSize: 14,
              color: COLORS.textDim,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span>🇬🇭 Accra Innovation Centre</span>
            <span>·</span>
            <span>🔒 Verified Sources</span>
            <span>·</span>
            <span>⚡ Zero Hidden Costs</span>
          </div>
        </div>
      </div>
    </div>
  )
}
