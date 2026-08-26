import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { BackgroundMesh } from '../../components/BackgroundMesh'
import { ApprovalModal } from '../../components/ApprovalModal'
import { WhatsAppPreview } from '../../components/WhatsAppPreview'
import { COLORS, customSpring, SPRINGS } from '../../theme'

export const Scene5UserApproval: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // First half (0-135 frames): Transparent Approval Dialog
  // Second half (135-270 frames): Instant WhatsApp Sharing
  const isSecondHalf = frame > 135

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
          marginBottom: 20,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: isSecondHalf ? 'rgba(37, 211, 102, 0.2)' : 'rgba(67, 106, 85, 0.25)',
            border: `1px solid ${isSecondHalf ? '#25D366' : COLORS.greenLight}66`,
            padding: '6px 20px',
            borderRadius: 20,
          }}
        >
          <span style={{ color: isSecondHalf ? '#25D366' : COLORS.greenLight, fontWeight: 800, fontSize: 13 }}>
            {isSecondHalf ? 'STEP 05' : 'STEP 04'}
          </span>
          <span style={{ color: COLORS.white, fontWeight: 600, fontSize: 13 }}>
            · {isSecondHalf ? 'Instant WhatsApp & Multi-Channel Export' : 'Zero Hidden Costs & Full User Approval'}
          </span>
        </div>
      </div>

      <div style={{ zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        {!isSecondHalf ? <ApprovalModal /> : <WhatsAppPreview />}
      </div>
    </div>
  )
}
