import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface AI360WorkspaceFrameProps {
  activeMode?: 'chat' | 'agent' | 'studio' | 'library' | 'media'
  title?: string
  credits?: number
  children: React.ReactNode
  delay?: number
}

export const AI360WorkspaceFrame: React.FC<AI360WorkspaceFrameProps> = ({
  activeMode = 'chat',
  title = 'AI360 Workspace',
  credits = 150,
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = customSpring(frame, fps, delay, SPRINGS.smooth)
  const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const navItems = [
    { id: 'chat', label: 'Ask', icon: '💬', desc: 'Direct fast answers' },
    { id: 'agent', label: 'Research', icon: '🔍', desc: 'Live web & verified sources' },
    { id: 'studio', label: 'Build', icon: '⚡', desc: 'Campaigns & launch packs' },
    { id: 'library', label: 'Library', icon: '📁', desc: 'Saved deliverables' },
    { id: 'media', label: 'Media', icon: '🎨', desc: 'Images & 4s video' },
  ]

  return (
    <div
      style={{
        width: 1440,
        height: 820,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(16, 17, 18, 0.25), 0 0 0 1px rgba(16, 17, 18, 0.08)',
        backgroundColor: COLORS.paper,
        display: 'flex',
        border: `1px solid ${COLORS.line}`,
        opacity,
        transform: `scale(${scale})`,
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
      }}
    >
      {/* Real AI360 Dark Sidebar */}
      <div
        style={{
          width: 260,
          backgroundColor: COLORS.sidebarBg,
          color: COLORS.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 18px',
          borderRight: `1px solid ${COLORS.sidebarBorder}`,
        }}
      >
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 24px 6px', borderBottom: `1px solid ${COLORS.sidebarBorder}` }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: COLORS.white,
                color: COLORS.black,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: '-0.05em',
              }}
            >
              360
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: COLORS.white }}>
                AI360
              </div>
              <div style={{ fontSize: 11, color: COLORS.softGrey, fontWeight: 500 }}>
                ai360.africa
              </div>
            </div>
          </div>

          {/* Navigation Modes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.grey, padding: '0 8px 6px' }}>
              Workspaces
            </div>
            {navItems.map((item) => {
              const isActive = item.id === activeMode
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: isActive ? COLORS.sidebarHover : 'transparent',
                    border: isActive ? `1px solid rgba(255, 255, 255, 0.12)` : '1px solid transparent',
                    color: isActive ? COLORS.white : COLORS.sidebarMuted,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
                  </div>
                  {isActive && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: COLORS.greenLight }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Credits & Account */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'rgba(67, 106, 85, 0.2)',
              border: `1px solid ${COLORS.greenLight}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.greenLight, fontSize: 13 }}>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.white }}>{credits} Credits</span>
            </div>
            <span style={{ fontSize: 11, color: COLORS.softGrey }}>Private Pilot</span>
          </div>

          <div style={{ fontSize: 11, color: COLORS.grey, textAlign: 'center' }}>
            Built with Accra Innovation Centre
          </div>
        </div>
      </div>

      {/* Main App Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: COLORS.paper }}>
        {/* Topbar */}
        <div
          style={{
            height: 60,
            borderBottom: `1px solid ${COLORS.line}`,
            backgroundColor: COLORS.warmWhite,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.black }}>{title}</span>
            <span style={{ fontSize: 12, color: COLORS.grey }}>·</span>
            <span style={{ fontSize: 12, color: COLORS.grey, backgroundColor: COLORS.white, padding: '3px 10px', borderRadius: 12, border: `1px solid ${COLORS.line}` }}>
              AI Gateway · OpenRouter
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: COLORS.charcoal, fontWeight: 600 }}>🇬🇭 Accra</span>
          </div>
        </div>

        {/* Workspace Canvas */}
        <div style={{ flex: 1, padding: 28, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
