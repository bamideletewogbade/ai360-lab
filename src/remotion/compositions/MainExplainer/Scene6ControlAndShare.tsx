import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { AI360ApprovalCard } from '../../components/AI360ApprovalCard'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene6ControlAndShare: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const badgeSpring = customSpring(frame, fps, 0, SPRINGS.snappy)

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
        padding: '0 40px',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      <div style={{ transform: `scale(${badgeSpring})`, marginBottom: 20 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: COLORS.white,
            border: `1px solid ${COLORS.lineDark}`,
            padding: '6px 18px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 800,
            color: COLORS.black,
            boxShadow: '0 2px 8px rgba(16, 17, 18, 0.05)',
          }}
        >
          <span>STEP 05</span>
          <span>·</span>
          <span style={{ color: COLORS.green }}>You Stay in Control · Zero Hidden Costs</span>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <AI360ApprovalCard />
      </div>
    </div>
  )
}
