import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { AI360WorkspaceFrame } from '../../components/AI360WorkspaceFrame'
import { AI360Composer } from '../../components/AI360Composer'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene3ComposerInput: React.FC = () => {
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
          <span>STEP 02</span>
          <span>·</span>
          <span style={{ color: COLORS.green }}>State Your Goal in Ordinary Language</span>
        </div>
      </div>

      <AI360WorkspaceFrame activeMode="studio" title="AI360 Build Mode · Create and Launch" credits={150}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <AI360Composer
            startFrame={10}
            charSpeed={1.5}
            activeStarter={4}
            promptText="Help me launch Akwaaba Fresh fruit juice for busy office teams in Accra. Build a campaign, WhatsApp outreach copy, and a launch flyer."
          />
        </div>
      </AI360WorkspaceFrame>
    </div>
  )
}
