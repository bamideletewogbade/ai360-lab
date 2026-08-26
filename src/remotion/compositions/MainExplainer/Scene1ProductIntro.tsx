import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene1ProductIntro: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = customSpring(frame, fps, 10, SPRINGS.smooth)
  const tagScale = customSpring(frame, fps, 0, SPRINGS.snappy)
  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' })

  const featurePills = [
    { label: '💬 Chats', desc: 'Ask & Research' },
    { label: '📁 Projects', desc: 'Start with the outcome' },
    { label: '🖼️ Media Studio', desc: 'Images & 4s Video' },
    { label: '🎛️ Tools & Kits', desc: '17 Ready-to-use kits' },
  ]

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
      {/* Pilot Header Badge */}
      <div
        style={{
          transform: `scale(${tagScale})`,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: COLORS.white,
            border: `1.5px solid ${COLORS.lineDark}`,
            padding: '8px 24px',
            borderRadius: 30,
            boxShadow: '0 4px 16px rgba(16, 17, 18, 0.06)',
          }}
        >
          <span style={{ fontSize: 16 }}>🇬🇭</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: COLORS.black, letterSpacing: '0.04em' }}>
            AI360 AFRICA · PRODUCT WALKTHROUGH
          </span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: COLORS.green }} />
          <span style={{ fontSize: 13, color: COLORS.grey }}>ai360.africa</span>
        </div>
      </div>

      {/* Main Title Lockup */}
      <div style={{ transform: `scale(${scale})`, maxWidth: 1100 }}>
        <h1
          style={{
            fontSize: 66,
            fontWeight: 900,
            color: COLORS.black,
            lineHeight: 1.15,
            letterSpacing: '-0.04em',
            margin: '0 0 16px 0',
          }}
        >
          How to Use <span style={{ textDecoration: 'underline', textDecorationColor: COLORS.green }}>AI360 Africa</span>
        </h1>
        <p
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.clay,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          A Practical AI Workspace for African Research, Projects, and Creative Media
        </p>
      </div>

      {/* 4 Feature Cards */}
      <div
        style={{
          opacity: textOpacity,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginTop: 44,
          width: '100%',
          maxWidth: 1100,
        }}
      >
        {featurePills.map((pill, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: COLORS.white,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 14,
              padding: '16px 20px',
              textAlign: 'left',
              boxShadow: '0 4px 16px rgba(16, 17, 18, 0.04)',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.black, marginBottom: 4 }}>
              {pill.label}
            </div>
            <div style={{ fontSize: 12, color: COLORS.grey }}>
              {pill.desc}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, fontSize: 14, color: COLORS.grey }}>
        Built with care by <strong>AI360</strong> with the <strong>Accra Innovation Centre</strong>
      </div>
    </div>
  )
}
