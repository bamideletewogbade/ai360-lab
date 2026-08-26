import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = customSpring(frame, fps, 10, SPRINGS.smooth)
  const tagScale = customSpring(frame, fps, 0, SPRINGS.snappy)
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' })

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
        position: 'relative',
      }}
    >
      {/* Subtle Grid Lines matching AI360 Landing */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, ${COLORS.landingHairline}55 1px, transparent 1px),
            linear-gradient(to bottom, ${COLORS.landingHairline}55 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          opacity: 0.6,
        }}
      />

      {/* Pilot Tag */}
      <div
        style={{
          transform: `scale(${tagScale})`,
          marginBottom: 30,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: COLORS.white,
            border: `1px solid ${COLORS.lineDark}`,
            padding: '8px 24px',
            borderRadius: 30,
            boxShadow: '0 4px 16px rgba(16, 17, 18, 0.06)',
          }}
        >
          <span style={{ fontSize: 14 }}>🇬🇭</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.black, letterSpacing: '0.04em' }}>
            AI360 AFRICA · PRIVATE PILOT
          </span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: COLORS.green }} />
          <span style={{ fontSize: 13, color: COLORS.grey }}>ai360.africa</span>
        </div>
      </div>

      {/* Main Title */}
      <div style={{ transform: `scale(${scale})`, zIndex: 1, maxWidth: 1100 }}>
        <h1
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: COLORS.black,
            lineHeight: 1.15,
            letterSpacing: '-0.04em',
            margin: '0 0 20px 0',
          }}
        >
          How to Use <span style={{ textDecoration: 'underline', textDecorationColor: COLORS.green }}>AI360 Africa</span>
        </h1>
        <p
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: COLORS.clay,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          Turn Ordinary Language into Research, Decisions & Launch Materials
        </p>
      </div>

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          zIndex: 1,
          marginTop: 28,
          maxWidth: 820,
        }}
      >
        <p style={{ fontSize: 18, color: COLORS.grey, lineHeight: 1.5, margin: 0 }}>
          A practical AI workspace built by <strong>AI360</strong> with the <strong>Accra Innovation Centre</strong>.
        </p>
      </div>
    </div>
  )
}
