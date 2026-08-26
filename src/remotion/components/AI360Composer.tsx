import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface AI360ComposerProps {
  promptText?: string
  startFrame?: number
  charSpeed?: number
  activeStarter?: number
}

export const AI360Composer: React.FC<AI360ComposerProps> = ({
  promptText = 'Help me turn this idea into a clear direction and ready-to-share materials: Launch an agribusiness delivery service for fresh produce to office teams in Accra.',
  startFrame = 10,
  charSpeed = 1.3,
  activeStarter = 4,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const relativeFrame = Math.max(0, frame - startFrame)
  const typedLength = Math.min(promptText.length, Math.floor(relativeFrame * charSpeed))
  const displayedText = promptText.substring(0, typedLength)
  const isTypingComplete = typedLength >= promptText.length

  const cursorOpacity = Math.sin(frame / 6) > 0 ? 1 : 0

  const starters = [
    { mark: '01', label: 'Understand something', mode: 'Ask' },
    { mark: '02', label: 'Plan something', mode: 'Ask' },
    { mark: '03', label: 'Make a decision', mode: 'Research' },
    { mark: '04', label: 'Create and launch', mode: 'Build' },
  ]

  const buttonSpring = isTypingComplete
    ? customSpring(frame, fps, startFrame + Math.floor(promptText.length / charSpeed) + 5, SPRINGS.bouncy)
    : 1

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1040,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      {/* 4 Real AI360 Starters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {starters.map((s, idx) => {
          const isSelected = idx + 1 === activeStarter
          return (
            <div
              key={s.mark}
              style={{
                backgroundColor: isSelected ? COLORS.white : 'rgba(255, 255, 255, 0.6)',
                border: isSelected ? `1.5px solid ${COLORS.black}` : `1px solid ${COLORS.line}`,
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: isSelected ? '0 4px 16px rgba(16, 17, 18, 0.08)' : 'none',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: isSelected ? COLORS.white : COLORS.grey,
                  backgroundColor: isSelected ? COLORS.black : COLORS.landingBand,
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                {s.mark}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.black }}>{s.label}</span>
                <span style={{ fontSize: 11, color: COLORS.grey }}>Mode: {s.mode}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Composer Box */}
      <div
        style={{
          backgroundColor: COLORS.white,
          borderRadius: 18,
          border: `1.5px solid ${isTypingComplete ? COLORS.black : COLORS.lineDark}`,
          boxShadow: isTypingComplete
            ? '0 12px 36px rgba(16, 17, 18, 0.12)'
            : '0 4px 20px rgba(16, 17, 18, 0.04)',
          padding: '22px 24px',
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.clay, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Build Mode · Marketing Launch Pack
          </div>

          <div
            style={{
              fontSize: 20,
              lineHeight: 1.5,
              color: COLORS.black,
              fontWeight: 500,
              minHeight: 70,
            }}
          >
            {displayedText}
            <span style={{ opacity: cursorOpacity, color: COLORS.green, fontWeight: 300, marginLeft: 2 }}>
              |
            </span>
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 16,
            borderTop: `1px solid ${COLORS.line}`,
          }}
        >
          {/* Options (Language, Depth, Attachment) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: COLORS.warmWhite,
                border: `1px solid ${COLORS.line}`,
                fontSize: 12,
                color: COLORS.charcoal,
                fontWeight: 600,
              }}
            >
              <span>🌐</span> English (Ghana)
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: COLORS.warmWhite,
                border: `1px solid ${COLORS.line}`,
                fontSize: 12,
                color: COLORS.charcoal,
                fontWeight: 600,
              }}
            >
              <span>📎</span> Add PDF / Image
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: COLORS.greenBg,
                border: `1px solid ${COLORS.greenLight}44`,
                fontSize: 12,
                color: COLORS.green,
                fontWeight: 700,
              }}
            >
              <span>✓</span> Live Web Citations
            </div>
          </div>

          {/* Send Button */}
          <div
            style={{
              transform: `scale(${buttonSpring})`,
              width: 44,
              height: 44,
              borderRadius: '50%',
              backgroundColor: isTypingComplete ? COLORS.black : COLORS.lineDark,
              color: COLORS.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 800,
              boxShadow: isTypingComplete ? '0 4px 14px rgba(16, 17, 18, 0.3)' : 'none',
              cursor: 'pointer',
            }}
          >
            ↑
          </div>
        </div>
      </div>
    </div>
  )
}
