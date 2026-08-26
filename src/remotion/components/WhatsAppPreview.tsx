import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

export const WhatsAppPreview: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const phoneScale = customSpring(frame, fps, 0, SPRINGS.smooth)
  const messageScale = customSpring(frame, fps, 15, SPRINGS.bouncy)
  const buttonPulse = customSpring(frame, fps, 30, SPRINGS.snappy)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        width: '100%',
        maxWidth: 1050,
        margin: '0 auto',
      }}
    >
      {/* Left Explainer Callout */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(37, 211, 102, 0.15)',
            border: '1px solid rgba(37, 211, 102, 0.4)',
            padding: '6px 14px',
            borderRadius: 20,
            color: '#25D366',
            fontSize: 13,
            fontWeight: 700,
            width: 'fit-content',
          }}
        >
          <span>📱 Instant WhatsApp Dispatch</span>
        </div>

        <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.white, lineHeight: 1.2 }}>
          From Approved Copy to Customer’s Chat in Seconds
        </div>

        <p style={{ fontSize: 16, color: COLORS.textMuted, lineHeight: 1.6 }}>
          Never copy-paste between 5 different tabs. AI360 generates native WhatsApp outreach messages formatted with emojis, clear pricing, and direct order buttons.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              padding: '10px 18px',
              backgroundColor: '#25D366',
              color: '#075E54',
              fontWeight: 700,
              borderRadius: 10,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transform: `scale(${buttonPulse})`,
            }}
          >
            <span>💬 Share to WhatsApp</span>
          </div>
          <div
            style={{
              padding: '10px 18px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: COLORS.white,
              fontWeight: 600,
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            📋 Copy Message
          </div>
        </div>
      </div>

      {/* Right Smartphone Screen Mockup */}
      <div
        style={{
          width: 340,
          height: 480,
          backgroundColor: '#0b141a',
          borderRadius: 36,
          border: '4px solid #222e35',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 30px rgba(37, 211, 102, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transform: `scale(${phoneScale})`,
        }}
      >
        {/* WhatsApp Header */}
        <div
          style={{
            backgroundColor: '#1f2c34',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #2a3942',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: COLORS.green,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: COLORS.white,
              fontSize: 14,
            }}
          >
            AF
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e9edef' }}>Akwaaba Fresh (Office)</div>
            <div style={{ fontSize: 11, color: '#8696a0' }}>online</div>
          </div>
        </div>

        {/* WhatsApp Chat Body */}
        <div
          style={{
            flex: 1,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 10,
            backgroundImage: 'radial-gradient(#182229 15%, transparent 16%)',
            backgroundSize: '16px 16px',
          }}
        >
          {/* Incoming bubble */}
          <div
            style={{
              alignSelf: 'flex-end',
              maxWidth: '85%',
              backgroundColor: '#005c4b',
              color: '#e9edef',
              padding: '10px 14px',
              borderRadius: '12px 12px 2px 12px',
              fontSize: 13,
              lineHeight: 1.4,
              transform: `scale(${messageScale})`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <div>
              👋 <strong>Good morning Kwame!</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              Fresh hibiscus & ginger juice delivered straight to your office in Airport City today! 🌺🍍
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#97d8be' }}>
              ✓ 100% natural, no additives
              <br />✓ Chilled & ready by 11:30 AM
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#8696a0' }}>10:42 AM</span>
              <span style={{ color: '#53bdeb', fontSize: 12 }}>✓✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
