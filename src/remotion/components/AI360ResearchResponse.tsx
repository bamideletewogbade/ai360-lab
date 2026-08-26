import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const AI360ResearchResponse: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 0, SPRINGS.smooth)
  const streamProgress = Math.min(1, frame / 90)

  const sources = [
    { title: 'Bank of Ghana Payment Systems Report', domain: 'bog.gov.gh' },
    { title: 'Accra Retail & Delivery Directory', domain: 'businessghana.com' },
    { title: 'FDA Ghana Commercial Guidelines', domain: 'fdaghana.gov.gh' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: '100%',
        maxWidth: 1040,
        margin: '0 auto',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      {/* User Prompt Bubble */}
      <div
        style={{
          alignSelf: 'flex-end',
          backgroundColor: COLORS.white,
          border: `1px solid ${COLORS.line}`,
          padding: '12px 20px',
          borderRadius: '16px 16px 4px 16px',
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.black,
          boxShadow: '0 2px 8px rgba(16, 17, 18, 0.04)',
          maxWidth: '75%',
        }}
      >
        “Research the market and consumer demand for fruit juice delivery in Accra offices.”
      </div>

      {/* Agent Streaming Response Card */}
      <div
        style={{
          backgroundColor: COLORS.white,
          borderRadius: 18,
          border: `1px solid ${COLORS.line}`,
          padding: 24,
          boxShadow: '0 6px 24px rgba(16, 17, 18, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transform: `scale(${cardScale})`,
        }}
      >
        {/* Assistant Header & Verification Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: COLORS.black,
                color: COLORS.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              360
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.black }}>AI360 Research Agent</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 20,
              backgroundColor: COLORS.greenBg,
              border: `1px solid ${COLORS.greenLight}44`,
              color: COLORS.green,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span>✓</span> Verified with Live Sources
          </div>
        </div>

        {/* Real Step Progression from AI360 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: COLORS.warmWhite,
            padding: '10px 16px',
            borderRadius: 10,
            border: `1px solid ${COLORS.line}`,
            fontSize: 12,
          }}
        >
          <div style={{ color: COLORS.green, fontWeight: 700 }}>✓ Understand brief</div>
          <div style={{ color: COLORS.grey }}>→</div>
          <div style={{ color: COLORS.green, fontWeight: 700 }}>✓ Live web search</div>
          <div style={{ color: COLORS.grey }}>→</div>
          <div style={{ color: COLORS.black, fontWeight: 700 }}>● Sourced synthesis</div>
        </div>

        {/* Content Preview */}
        <div style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.charcoal }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: COLORS.black }}>
            Executive Market Summary for Accra:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>
              <strong>Target Hubs:</strong> High corporate density in Airport City, Ridge, and Osu with recurring demand for healthy 100% natural juices.
            </li>
            <li>
              <strong>Payment & Delivery:</strong> 88% of office transactions occur via Mobile Money (MTN MoMo, Telecel Cash). Pre-scheduled 11:30 AM drops maximize daily conversion.
            </li>
            <li>
              <strong>Competitive Edge:</strong> Low-sugar, freshly pressed hibiscus (Sobolo) blends with zero artificial preservatives.
            </li>
          </ul>
        </div>

        {/* Sources Footer */}
        <div
          style={{
            borderTop: `1px solid ${COLORS.line}`,
            paddingTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.grey, textTransform: 'uppercase' }}>
            Sources Cited:
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sources.map((s, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: 11,
                  backgroundColor: COLORS.warmWhite,
                  border: `1px solid ${COLORS.line}`,
                  padding: '3px 10px',
                  borderRadius: 6,
                  color: COLORS.charcoal,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>🔗</span> {s.title}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
