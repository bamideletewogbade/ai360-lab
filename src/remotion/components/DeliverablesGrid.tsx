import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const DeliverablesGrid: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const deliverables = [
    {
      mark: '01',
      title: 'Brand & Launch Strategy',
      type: 'Executive Brief',
      icon: '📋',
      badge: 'Approved',
      preview: 'Positioning: Natural energy boost for Accra office workers. Zero additives. Same-day dispatch.',
      accent: COLORS.greenLight,
    },
    {
      mark: '02',
      title: 'WhatsApp Direct Outreach',
      type: 'Messaging Copy',
      icon: '💬',
      badge: 'Ready to Share',
      preview: '“Good morning Kwame! Need fresh fruit juice delivered to your team in Airport City today?...”',
      accent: '#25D366',
    },
    {
      mark: '03',
      title: 'Social Graphic & Flyer',
      type: 'Visual Asset',
      icon: '🎨',
      badge: 'Download PNG',
      preview: '1080x1080 high-contrast Ghanaian hibiscus juice composition ready for Instagram & Print.',
      accent: COLORS.clayLight,
    },
    {
      mark: '04',
      title: '720p Vertical Video',
      type: 'Shorts & Status',
      icon: '🎬',
      badge: 'Rendered MP4',
      preview: '4-second punchy product reveal video with synchronized typography and motion accents.',
      accent: COLORS.violetLight,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.clayLight, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Production-Ready Deliverables
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.white }}>
            Everything You Need to Launch
          </div>
        </div>

        <div
          style={{
            fontSize: 13,
            color: COLORS.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📦 1-Click Export to ZIP / PDF / WhatsApp</span>
        </div>
      </div>

      {/* Grid of 4 deliverables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {deliverables.map((item, index) => {
          const delay = index * 12
          const scale = customSpring(frame, fps, delay, SPRINGS.bouncy)
          const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })

          return (
            <div
              key={item.mark}
              style={{
                backgroundColor: 'rgba(24, 28, 33, 0.9)',
                borderRadius: 16,
                border: `1.5px solid ${item.accent}55`,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: 240,
                opacity,
                transform: `scale(${scale})`,
                boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 25px ${item.accent}22`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Top mark & icon */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: item.accent,
                      backgroundColor: `${item.accent}1f`,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {item.mark}
                  </span>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>{item.type}</div>

                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textBright,
                    lineHeight: 1.4,
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {item.preview}
                </div>
              </div>

              {/* Bottom Action Badge */}
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 12px',
                  borderRadius: 8,
                  backgroundColor: `${item.accent}22`,
                  border: `1px solid ${item.accent}66`,
                  color: item.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>✓</span> {item.badge}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
