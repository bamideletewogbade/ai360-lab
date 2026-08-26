import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface AppWindowProps {
  title?: string
  credits?: number
  mode?: string
  width?: number | string
  height?: number | string
  children: React.ReactNode
  delay?: number
}

export const AppWindow: React.FC<AppWindowProps> = ({
  title = 'ai360.africa — Workspace',
  credits = 120,
  mode = 'Auto Gateway',
  width = 1380,
  height = 760,
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = customSpring(frame, fps, delay, SPRINGS.smooth)
  const opacity = interpolate(frame, [delay, delay + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Subtle 3D hover tilt
  const tiltX = Math.sin(frame / 60) * 1.5
  const tiltY = Math.cos(frame / 80) * 2

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: 'rgba(18, 21, 25, 0.92)',
        borderRadius: 20,
        border: `1px solid ${COLORS.borderGlass}`,
        boxShadow: `0 30px 90px rgba(0,0,0,0.6), 0 0 40px ${COLORS.greenGlow}`,
        backdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity,
        transform: `perspective(1200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${scale})`,
        transition: 'transform 0.2s ease-out',
      }}
    >
      {/* Top Title Bar */}
      <div
        style={{
          height: 48,
          backgroundColor: 'rgba(12, 14, 17, 0.8)',
          borderBottom: `1px solid ${COLORS.borderGlass}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        {/* macOS window dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 120 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>

        {/* Center Title */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.textMuted,
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: COLORS.greenLight }}>●</span> {title}
        </div>

        {/* Right Status / Credits Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 140, justifyContent: 'flex-end' }}>
          <div
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              backgroundColor: 'rgba(67, 106, 85, 0.25)',
              border: `1px solid ${COLORS.greenLight}44`,
              color: COLORS.greenLight,
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚡</span> {credits} Credits
          </div>
        </div>
      </div>

      {/* Main Window Inner Content */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
