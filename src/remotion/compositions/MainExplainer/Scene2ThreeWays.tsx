import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene2ThreeWays: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const modes = [
    {
      mark: '01',
      title: 'Ask (Chat)',
      icon: '💬',
      desc: 'Direct streaming answers for fast questions, drafting, and explanations.',
      badge: 'Free / Fast',
      color: COLORS.black,
    },
    {
      mark: '02',
      title: 'Research (Agent)',
      icon: '🔍',
      desc: 'Live web search with verified sources, trade data, and attached citations.',
      badge: 'Live Citations',
      color: COLORS.green,
    },
    {
      mark: '03',
      title: 'Build (Studio)',
      icon: '⚡',
      desc: 'Turn a goal into brand strategy, WhatsApp outreach, social graphics & 4s video.',
      badge: 'Campaign Packs',
      color: COLORS.clay,
    },
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
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Step 01 · Three Ways to Work
        </div>
        <div style={{ fontSize: 44, fontWeight: 900, color: COLORS.black, letterSpacing: '-0.03em' }}>
          Pick the Right Tool for Your Task
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, width: '100%', maxWidth: 1180 }}>
        {modes.map((m, idx) => {
          const delay = idx * 12
          const scale = customSpring(frame, fps, delay, SPRINGS.bouncy)
          const opacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: 'clamp' })

          return (
            <div
              key={m.mark}
              style={{
                backgroundColor: COLORS.white,
                borderRadius: 18,
                border: `1.5px solid ${COLORS.line}`,
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: 280,
                opacity,
                transform: `scale(${scale})`,
                boxShadow: '0 8px 30px rgba(16, 17, 18, 0.06)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: COLORS.white,
                      backgroundColor: m.color,
                      padding: '3px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {m.mark}
                  </span>
                  <span style={{ fontSize: 28 }}>{m.icon}</span>
                </div>

                <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.black, marginBottom: 8 }}>
                  {m.title}
                </div>

                <div style={{ fontSize: 14, color: COLORS.charcoal, lineHeight: 1.5 }}>
                  {m.desc}
                </div>
              </div>

              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  backgroundColor: COLORS.warmWhite,
                  border: `1px solid ${COLORS.line}`,
                  color: m.color,
                  fontSize: 12,
                  fontWeight: 700,
                  width: 'fit-content',
                }}
              >
                ● {m.badge}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
