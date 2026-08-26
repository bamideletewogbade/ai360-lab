import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { AI360WorkspaceFrame } from '../../components/AI360WorkspaceFrame'
import { AI360ResearchResponse } from '../../components/AI360ResearchResponse'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene4ResearchSources: React.FC = () => {
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
      <div style={{ transform: `scale(${badgeSpring})`, marginBottom: 16 }}>
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
          <span>STEP 03</span>
          <span>·</span>
          <span style={{ color: COLORS.green }}>Live Web Citations & Evidence Grounding</span>
        </div>
      </div>

      <AI360WorkspaceFrame activeMode="agent" title="AI360 Research Mode · Live Evidence" credits={146}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <AI360ResearchResponse />
        </div>
      </AI360WorkspaceFrame>
    </div>
  )
}
