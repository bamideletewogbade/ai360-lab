import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const AI360ApprovalCard: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 0, SPRINGS.bouncy)

  return (
    <div
      style={{
        maxWidth: 760,
        width: '100%',
        margin: '0 auto',
        backgroundColor: COLORS.white,
        borderRadius: 18,
        border: `1.5px solid ${COLORS.lineDark}`,
        boxShadow: '0 16px 48px rgba(16, 17, 18, 0.12)',
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
        transform: `scale(${cardScale})`,
      }}
    >
      {/* Step Tag */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: COLORS.white,
              backgroundColor: COLORS.black,
              padding: '3px 8px',
              borderRadius: 6,
            }}
          >
            03 · Your decision
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.green }}>
            Human-in-the-Loop Control
          </span>
        </div>

        <span style={{ fontSize: 12, color: COLORS.grey }}>
          Zero Silent Costs Guarantee
        </span>
      </div>

      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.black, marginBottom: 4 }}>
          Direction Ready to Review
        </div>
        <p style={{ fontSize: 14, color: COLORS.charcoal, margin: 0, lineHeight: 1.5 }}>
          Change the idea, approve it, or stop here. Nothing expensive runs on its own.
        </p>
      </div>

      {/* Quote Box */}
      <div
        style={{
          backgroundColor: COLORS.warmWhite,
          padding: '14px 18px',
          borderRadius: 10,
          border: `1px solid ${COLORS.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.black }}>
            4-Second 720p Vertical Video & High-Res Graphics
          </div>
          <div style={{ fontSize: 12, color: COLORS.grey, marginTop: 2 }}>
            Estimated allowance cost
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.green }}>
            4 Credits (~$0.08)
          </div>
          <div style={{ fontSize: 11, color: COLORS.grey }}>Live quote confirmed</div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8 }}>
        <button
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            backgroundColor: COLORS.warmWhite,
            border: `1px solid ${COLORS.line}`,
            color: COLORS.charcoal,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ask for changes
        </button>

        <button
          style={{
            padding: '10px 22px',
            borderRadius: 10,
            backgroundColor: COLORS.black,
            border: 'none',
            color: COLORS.white,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 14px rgba(16, 17, 18, 0.25)',
            cursor: 'pointer',
          }}
        >
          <span>✓</span> Approve direction
        </button>
      </div>
    </div>
  )
}
