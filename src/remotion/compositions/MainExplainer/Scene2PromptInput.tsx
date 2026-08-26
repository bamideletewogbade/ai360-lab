import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { AppWindow } from '../../components/AppWindow'
import { BackgroundMesh } from '../../components/BackgroundMesh'
import { TypingPrompt } from '../../components/TypingPrompt'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene2PromptInput: React.FC = () => {
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
      <BackgroundMesh intensity={0.9} />

      {/* Step Tag */}
      <div
        style={{
          transform: `scale(${badgeSpring})`,
          marginBottom: 20,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            border: `1px solid ${COLORS.clayLight}55`,
            padding: '6px 18px',
            borderRadius: 20,
          }}
        >
          <span style={{ color: COLORS.clayLight, fontWeight: 800, fontSize: 13 }}>STEP 01</span>
          <span style={{ color: COLORS.white, fontWeight: 600, fontSize: 13 }}>· State Your Real-World Goal</span>
        </div>
      </div>

      {/* App Window Wrapper */}
      <div style={{ zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <AppWindow title="ai360.africa — Start Workspace" credits={150} delay={5}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px 0' }}>
            <TypingPrompt
              startFrame={15}
              charSpeed={1.4}
              text="Help me launch Akwaaba Fresh hibiscus juice to busy office teams in Accra. Build a strategy, WhatsApp outreach copy, and a launch flyer."
            />
          </div>
        </AppWindow>
      </div>
    </div>
  )
}
