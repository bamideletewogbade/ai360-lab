import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { AppWindow } from '../../components/AppWindow'
import { BackgroundMesh } from '../../components/BackgroundMesh'
import { DeliverablesGrid } from '../../components/DeliverablesGrid'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene4Deliverables: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const badgeSpring = customSpring(frame, fps, 0, SPRINGS.snappy)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <BackgroundMesh intensity={1.1} />

      {/* Step Tag */}
      <div
        style={{
          transform: `scale(${badgeSpring})`,
          marginBottom: 16,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(166, 99, 62, 0.25)',
            border: `1px solid ${COLORS.clayLight}66`,
            padding: '6px 18px',
            borderRadius: 20,
          }}
        >
          <span style={{ color: COLORS.clayLight, fontWeight: 800, fontSize: 13 }}>STEP 03</span>
          <span style={{ color: COLORS.white, fontWeight: 600, fontSize: 13 }}>· Complete Campaign Deliverables In One Place</span>
        </div>
      </div>

      {/* App Window with Deliverables */}
      <div style={{ zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <AppWindow title="ai360.africa — Studio Deliverables (Akwaaba Fresh Pack)" credits={140} delay={5}>
          <DeliverablesGrid />
        </AppWindow>
      </div>
    </div>
  )
}
