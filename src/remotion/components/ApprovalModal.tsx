import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const ApprovalModal: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 0, SPRINGS.bouncy)
  const pulseGreen = Math.sin(frame / 10) * 0.15 + 0.85

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        backgroundColor: 'rgba(20, 24, 28, 0.95)',
        borderRadius: 20,
        border: `1.5px solid ${COLORS.borderActive}`,
        boxShadow: `0 25px 70px rgba(0,0,0,0.7), 0 0 40px ${COLORS.greenGlow}`,
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        transform: `scale(${cardScale})`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'rgba(67, 106, 85, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🛡️
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.white }}>Execution Approval Required</div>
            <div style={{ fontSize: 12, color: COLORS.clayLight, fontWeight: 600 }}>Zero Silent Costs Guarantee</div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '4px 12px',
            borderRadius: 10,
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Studio Stage 03 · Review
        </div>
      </div>

      {/* Asset Quote Details */}
      <div
        style={{
          backgroundColor: 'rgba(12, 14, 17, 0.7)',
          borderRadius: 14,
          padding: 18,
          border: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>
            Deliverable: 720p Vertical Launch Video & Graphic Pack
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
            Provider: Luma Ray 2 Fast · 4s 720p 9:16 Vertical Video
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.greenLight }}>4 Credits (~$0.08)</div>
          <div style={{ fontSize: 11, color: COLORS.textDim }}>Live provider quote validated</div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
        You stay in complete control of your budget. Change the direction, refine prompts, or approve execution. Nothing expensive runs on its own.
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          style={{
            padding: '12px 20px',
            borderRadius: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: COLORS.white,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Ask for Changes
        </button>

        <button
          style={{
            padding: '12px 26px',
            borderRadius: 12,
            backgroundColor: COLORS.green,
            border: 'none',
            color: COLORS.white,
            fontWeight: 700,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 4px 20px rgba(95, 167, 132, ${pulseGreen})`,
            cursor: 'pointer',
          }}
        >
          <span>✓ Approve & Generate Asset</span>
        </button>
      </div>
    </div>
  )
}
