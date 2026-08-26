import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface SpecialistItem {
  id: string
  name: string
  role: string
  status: 'done' | 'live' | 'next'
  icon: string
  details: string
  sources?: string[]
}

export const SpecialistPipeline: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const specialists: SpecialistItem[] = [
    {
      id: 'research',
      name: 'Researcher Specialist',
      role: 'Live Web Search & Verification',
      status: frame > 70 ? 'done' : 'live',
      icon: '🔍',
      details: 'Discovered Accra beverage market dynamics & price benchmarks',
      sources: ['Accra Central Trade Data', 'Ghana Food & Drugs Authority Guidelines', 'Mobile Money Pay Trends'],
    },
    {
      id: 'brand',
      name: 'Brand Strategist',
      role: 'Positioning & Value Proposition',
      status: frame > 110 ? 'done' : frame > 50 ? 'live' : 'next',
      icon: '🎯',
      details: 'Formulated energetic, reliable positioning for busy Accra professionals',
    },
    {
      id: 'copy',
      name: 'Direct Copywriter',
      role: 'High-Converting Messaging',
      status: frame > 140 ? 'done' : frame > 90 ? 'live' : 'next',
      icon: '✍️',
      details: 'Drafted 3-part WhatsApp cold outreach + Instagram launch hooks',
    },
    {
      id: 'media',
      name: 'Media Director',
      role: 'Visual Assets & Video Plan',
      status: frame > 120 ? 'live' : 'next',
      icon: '🎨',
      details: 'Generated 1080x1080 social flyer direction + 720p vertical video storyboard',
    },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: '100%',
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.greenLight, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Multi-Specialist Orchestration Engine
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.white }}>
            Translating Goal into Verified Deliverables
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(67, 106, 85, 0.25)',
            border: `1px solid ${COLORS.greenLight}44`,
            padding: '6px 14px',
            borderRadius: 20,
            color: COLORS.greenLight,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.greenLight, animation: 'pulse 1s infinite' }} />
          Gateway Active · Primary Route
        </div>
      </div>

      {/* Specialist Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {specialists.map((spec, i) => {
          const delay = i * 15
          const cardScale = customSpring(frame, fps, delay, SPRINGS.smooth)
          const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })

          const isLive = spec.status === 'live'
          const isDone = spec.status === 'done'

          return (
            <div
              key={spec.id}
              style={{
                backgroundColor: isLive
                  ? 'rgba(32, 42, 36, 0.85)'
                  : isDone
                  ? 'rgba(24, 28, 33, 0.8)'
                  : 'rgba(18, 20, 24, 0.5)',
                borderRadius: 16,
                border: isLive
                  ? `1.5px solid ${COLORS.greenLight}`
                  : isDone
                  ? `1px solid rgba(67, 106, 85, 0.4)`
                  : `1px solid ${COLORS.borderGlass}`,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                opacity: cardOpacity,
                transform: `scale(${cardScale})`,
                boxShadow: isLive ? `0 8px 30px ${COLORS.greenGlow}` : 'none',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: isLive
                        ? COLORS.green
                        : isDone
                        ? 'rgba(67, 106, 85, 0.3)'
                        : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}
                  >
                    {spec.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>{spec.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>{spec.role}</div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    backgroundColor: isDone
                      ? 'rgba(34, 197, 94, 0.2)'
                      : isLive
                      ? 'rgba(56, 189, 248, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    color: isDone ? '#4ade80' : isLive ? '#38bdf8' : COLORS.textDim,
                    border: `1px solid ${isDone ? '#22c55e44' : isLive ? '#38bdf844' : 'transparent'}`,
                  }}
                >
                  {isDone ? '✓ Completed' : isLive ? '● Synthesizing' : 'Waiting'}
                </div>
              </div>

              {/* Details */}
              <div style={{ fontSize: 13, color: COLORS.textBright, lineHeight: 1.4 }}>{spec.details}</div>

              {/* Sources attached */}
              {spec.sources && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.clayLight }}>Attached Live Sources:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {spec.sources.map((s, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.07)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          color: COLORS.textMuted,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        🔗 {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
