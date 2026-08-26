import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const AI360StudioPack: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const deliverables = [
    {
      mark: '01',
      title: 'Strategy & Brand Brief',
      category: 'Document',
      icon: '📄',
      summary: 'Brand foundation, value proposition, and distribution model for Accra office hubs.',
      tag: 'Approved',
    },
    {
      mark: '02',
      title: 'WhatsApp Outreach Copy',
      category: 'WhatsApp Sequence',
      icon: '💬',
      summary: '“Good morning! Fresh ginger-hibiscus juice deliveries for your team today...”',
      tag: 'Ready to Send',
    },
    {
      mark: '03',
      title: 'Social Graphic & Flyer',
      category: 'Image Direction',
      icon: '🖼️',
      summary: 'High-contrast 1080x1080 Ghanaian fruit juice visual with MoMo payment badge.',
      tag: 'PNG Download',
    },
    {
      mark: '04',
      title: '4s Vertical Launch Video',
      category: 'Video Asset',
      icon: '🎬',
      summary: '720p 9:16 vertical motion reveal for WhatsApp Status and Instagram Reels.',
      tag: 'Ready to Render',
    },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        width: '100%',
        maxWidth: 1040,
        margin: '0 auto',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      {/* Studio Project Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: COLORS.white,
          padding: '16px 20px',
          borderRadius: 14,
          border: `1px solid ${COLORS.line}`,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.clay, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            AI360 Studio · Project Deliverables
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.black }}>
            Akwaaba Fresh — Marketing Launch Pack
          </div>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: '#25D366',
              color: COLORS.white,
              fontWeight: 700,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>💬</span> Share to WhatsApp
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: COLORS.warmWhite,
              border: `1px solid ${COLORS.line}`,
              color: COLORS.charcoal,
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            📥 Export All (ZIP)
          </div>
        </div>
      </div>

      {/* Grid of Deliverables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {deliverables.map((item, idx) => {
          const delay = idx * 10
          const scale = customSpring(frame, fps, delay, SPRINGS.bouncy)
          const opacity = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateRight: 'clamp' })

          return (
            <div
              key={item.mark}
              style={{
                backgroundColor: COLORS.white,
                borderRadius: 14,
                border: `1px solid ${COLORS.line}`,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: 220,
                opacity,
                transform: `scale(${scale})`,
                boxShadow: '0 4px 16px rgba(16, 17, 18, 0.05)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: COLORS.white,
                      backgroundColor: COLORS.black,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {item.mark}
                  </span>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.black, marginBottom: 2 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: COLORS.grey, marginBottom: 8 }}>{item.category}</div>

                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.charcoal,
                    lineHeight: 1.4,
                    backgroundColor: COLORS.warmWhite,
                    padding: 8,
                    borderRadius: 6,
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  {item.summary}
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: COLORS.greenBg,
                  border: `1px solid ${COLORS.greenLight}44`,
                  color: COLORS.green,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                ✓ {item.tag}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
