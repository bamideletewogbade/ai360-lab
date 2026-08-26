import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface TypingPromptProps {
  text?: string
  startFrame?: number
  charSpeed?: number
  selectedStarter?: string
}

export const TypingPrompt: React.FC<TypingPromptProps> = ({
  text = 'Help me launch Akwaaba Fresh hibiscus drink for busy office teams in Accra. Build a campaign, WhatsApp outreach copy, and a launch flyer.',
  startFrame = 10,
  charSpeed = 1.3,
  selectedStarter = 'Create & Launch',
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Calculate typed characters based on frame progress
  const relativeFrame = Math.max(0, frame - startFrame)
  const typedLength = Math.min(text.length, Math.floor(relativeFrame * charSpeed))
  const displayedText = text.substring(0, typedLength)
  const isTypingComplete = typedLength >= text.length

  // Blinking cursor
  const cursorOpacity = Math.sin(frame / 6) > 0 ? 1 : 0

  const starters = [
    { mark: '01', label: 'Understand', active: false },
    { mark: '02', label: 'Plan & Research', active: false },
    { mark: '03', label: 'Make a Decision', active: false },
    { mark: '04', label: 'Create & Launch', active: true },
  ]

  const sendButtonScale = isTypingComplete
    ? customSpring(frame, fps, startFrame + Math.floor(text.length / charSpeed) + 5, SPRINGS.bouncy)
    : 1

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1080,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Starter Buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {starters.map((starter) => (
          <div
            key={starter.mark}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              backgroundColor: starter.active ? 'rgba(67, 106, 85, 0.3)' : 'rgba(255, 255, 255, 0.04)',
              border: starter.active
                ? `1px solid ${COLORS.greenLight}`
                : `1px solid ${COLORS.borderGlass}`,
              color: starter.active ? COLORS.greenLight : COLORS.textMuted,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: starter.active ? `0 0 20px ${COLORS.greenGlow}` : 'none',
              transform: starter.active ? 'translateY(-2px)' : 'none',
            }}
          >
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 6,
                backgroundColor: starter.active ? COLORS.greenLight : 'rgba(255, 255, 255, 0.1)',
                color: starter.active ? '#0d1117' : COLORS.textMuted,
                fontWeight: 700,
              }}
            >
              {starter.mark}
            </span>
            {starter.label}
          </div>
        ))}
      </div>

      {/* Main Composer Box */}
      <div
        style={{
          backgroundColor: 'rgba(20, 24, 28, 0.95)',
          borderRadius: 18,
          border: `1.5px solid ${isTypingComplete ? COLORS.greenLight : COLORS.borderGlass}`,
          boxShadow: isTypingComplete
            ? `0 12px 40px rgba(0,0,0,0.5), 0 0 35px ${COLORS.greenGlow}`
            : '0 12px 40px rgba(0,0,0,0.5)',
          padding: 24,
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.clayLight,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>✨</span> Your Goal in Natural Language
          </div>

          <div
            style={{
              fontSize: 22,
              lineHeight: 1.5,
              fontWeight: 500,
              color: COLORS.textBright,
              fontFamily: 'Inter, system-ui, sans-serif',
              minHeight: 70,
            }}
          >
            {displayedText}
            <span
              style={{
                opacity: cursorOpacity,
                color: COLORS.greenLight,
                fontWeight: 300,
                marginLeft: 2,
              }}
            >
              |
            </span>
          </div>
        </div>

        {/* Action Bottom Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 16,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                fontSize: 12,
                color: COLORS.textMuted,
              }}
            >
              Auto Gateway Routing
            </span>
            <span
              style={{
                fontSize: 12,
                color: COLORS.textDim,
              }}
            >
              Live Research & Sources Enabled
            </span>
          </div>

          <div
            style={{
              transform: `scale(${sendButtonScale})`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: isTypingComplete ? COLORS.green : '#2a2e33',
              color: COLORS.white,
              padding: '10px 22px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: isTypingComplete ? `0 4px 20px ${COLORS.greenGlow}` : 'none',
            }}
          >
            <span>Start Workflow</span>
            <span style={{ fontSize: 16 }}>→</span>
          </div>
        </div>
      </div>
    </div>
  )
}
