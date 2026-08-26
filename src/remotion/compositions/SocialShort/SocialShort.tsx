import React from 'react'
import { interpolate, Series, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

// Scene 1: Authentic Hook (0 - 150 frames = 5s)
const SocialHookScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const textScale = customSpring(frame, fps, 10, SPRINGS.bouncy)
  const tagSpring = customSpring(frame, fps, 0, SPRINGS.snappy)

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
          transform: `scale(${tagSpring})`,
          marginBottom: 40,
          backgroundColor: COLORS.white,
          border: `1px solid ${COLORS.lineDark}`,
          padding: '10px 24px',
          borderRadius: 30,
          boxShadow: '0 4px 16px rgba(16, 17, 18, 0.06)',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.black }}>
          🇬🇭 AI360 AFRICA · PILOT
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            backgroundColor: COLORS.black,
            color: COLORS.white,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: 26,
          }}
        >
          360
        </div>
        <span style={{ fontSize: 44, fontWeight: 900, color: COLORS.black }}>
          AI360 <span style={{ color: COLORS.clay }}>Africa</span>
        </span>
      </div>

      <div style={{ transform: `scale(${textScale})` }}>
        <h1
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: COLORS.black,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            margin: 0,
          }}
        >
          A Practical AI Workspace for African Businesses.
        </h1>
        <p
          style={{
            fontSize: 30,
            color: COLORS.green,
            marginTop: 26,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          Research with real citations. Full launch packs in minutes.
        </p>
      </div>
    </div>
  )
}

// Scene 2: 3-Step Walkthrough (150 - 450 frames = 10s)
const SocialStepScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const steps = [
    { num: '01', title: 'Ask, Research, or Build', desc: 'Pick the right mode for your task', icon: '💬', color: COLORS.black },
    { num: '02', title: 'Live Verified Web Sources', desc: 'Real citations with zero guesswork', icon: '🔍', color: COLORS.green },
    { num: '03', title: 'Studio Launch Packs', desc: 'Strategy, WhatsApp copy & flyers', icon: '⚡', color: COLORS.clay },
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
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.clay, letterSpacing: '0.08em' }}>
          HOW TO USE AI360
        </div>
        <div style={{ fontSize: 52, fontWeight: 900, color: COLORS.black, marginTop: 8 }}>
          3 Simple Steps
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, width: '100%' }}>
        {steps.map((s, idx) => {
          const delay = idx * 20
          const cardScale = customSpring(frame, fps, delay, SPRINGS.bouncy)
          const opacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: 'clamp' })

          return (
            <div
              key={s.num}
              style={{
                backgroundColor: COLORS.white,
                borderRadius: 22,
                border: `1.5px solid ${COLORS.line}`,
                padding: '28px 30px',
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                opacity,
                transform: `scale(${cardScale})`,
                boxShadow: '0 10px 30px rgba(16, 17, 18, 0.06)',
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 18,
                  backgroundColor: COLORS.warmWhite,
                  border: `1px solid ${COLORS.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 32,
                }}
              >
                {s.icon}
              </div>

              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color, letterSpacing: '0.08em' }}>
                  STEP {s.num}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: COLORS.black, marginTop: 2 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 20, color: COLORS.charcoal, marginTop: 2 }}>
                  {s.desc}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Scene 3: Pilot Invitation (450 - 750 frames = 10s)
const SocialOutroScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 10, SPRINGS.bouncy)
  const pulse = Math.sin(frame / 10) * 0.04 + 1

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
          borderRadius: 32,
          border: `1.5px solid ${COLORS.lineDark}`,
          padding: '50px 40px',
          boxShadow: '0 20px 60px rgba(16, 17, 18, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: COLORS.black,
              color: COLORS.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 22,
            }}
          >
            360
          </div>
          <span style={{ fontSize: 34, fontWeight: 900, color: COLORS.black }}>
            AI360 <span style={{ color: COLORS.clay }}>Africa</span>
          </span>
        </div>

        <div>
          <h2 style={{ fontSize: 52, fontWeight: 900, color: COLORS.black, margin: 0, lineHeight: 1.15 }}>
            Join the Private Pilot
          </h2>
          <p style={{ fontSize: 24, color: COLORS.charcoal, margin: '14px 0 0 0', lineHeight: 1.4 }}>
            Built with Accra Innovation Centre. Zero hidden fees.
          </p>
        </div>

        <div
          style={{
            backgroundColor: COLORS.black,
            color: COLORS.white,
            padding: '20px 44px',
            borderRadius: 16,
            fontSize: 28,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 8px 24px rgba(16, 17, 18, 0.25)',
            transform: `scale(${pulse})`,
          }}
        >
          <span>ai360.africa</span>
          <span>→</span>
        </div>

        <div style={{ fontSize: 18, color: COLORS.grey }}>
          Accra, Ghana · Live Research & Studio Packs
        </div>
      </div>
    </div>
  )
}

export const SocialShort: React.FC = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={150}>
        <SocialHookScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={300}>
        <SocialStepScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={300}>
        <SocialOutroScene />
      </Series.Sequence>
    </Series>
  )
}
