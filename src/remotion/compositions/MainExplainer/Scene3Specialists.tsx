import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { AppWindow } from '../../components/AppWindow'
import { BackgroundMesh } from '../../components/BackgroundMesh'
import { SpecialistPipeline } from '../../components/SpecialistPipeline'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene3Specialists: React.FC = () => {
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
      <BackgroundMesh intensity={1} />

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
            backgroundColor: 'rgba(67, 106, 85, 0.25)',
            border: `1px solid ${COLORS.greenLight}66`,
            padding: '6px 18px',
            borderRadius: 20,
          }}
        >
          <span style={{ color: COLORS.greenLight, fontWeight: 800, fontSize: 13 }}>STEP 02</span>
          <span style={{ color: COLORS.white, fontWeight: 600, fontSize: 13 }}>· Multi-Specialist Orchestration & Live Citations</span>
        </div>
      </div>

      {/* App Window with Specialist Pipeline */}
      <div style={{ zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <AppWindow title="ai360.africa — Studio Engine (Active Orchestration)" credits={144} delay={5}>
          <SpecialistPipeline />
        </AppWindow>
      </div>
    </div>
  )
}
