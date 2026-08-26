import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { COLORS } from '../theme'

interface BackgroundMeshProps {
  intensity?: number
  variant?: 'dark' | 'emerald' | 'warm'
}

export const BackgroundMesh: React.FC<BackgroundMeshProps> = ({
  intensity = 1,
  variant = 'dark',
}) => {
  const frame = useCurrentFrame()

  // Gentle floating animation
  const pulse1 = Math.sin(frame / 45) * 40
  const pulse2 = Math.cos(frame / 60) * 50
  const rotate1 = (frame / 2) % 360

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: COLORS.bgDark,
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {/* Dynamic Ambient Glow 1 (Green/Teal) */}
      <div
        style={{
          position: 'absolute',
          top: `${20 + pulse1 * 0.2}%`,
          left: `${15 + pulse2 * 0.2}%`,
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.greenLight}44 0%, transparent 70%)`,
          filter: 'blur(100px)',
          opacity: 0.6 * intensity,
          transform: `translate(-50%, -50%) scale(${1 + Math.sin(frame / 40) * 0.1})`,
        }}
      />

      {/* Dynamic Ambient Glow 2 (Violet / Innovation) */}
      <div
        style={{
          position: 'absolute',
          bottom: `${10 - pulse2 * 0.15}%`,
          right: `${15 - pulse1 * 0.2}%`,
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.violet}55 0%, transparent 70%)`,
          filter: 'blur(120px)',
          opacity: 0.5 * intensity,
          transform: `translate(50%, 50%) scale(${1 + Math.cos(frame / 50) * 0.1})`,
        }}
      />

      {/* Dynamic Ambient Glow 3 (Clay / Warm Gold) */}
      <div
        style={{
          position: 'absolute',
          top: `${50 + pulse2 * 0.3}%`,
          right: `${30 + pulse1 * 0.2}%`,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.clay}40 0%, transparent 70%)`,
          filter: 'blur(90px)',
          opacity: 0.4 * intensity,
        }}
      />

      {/* Subtle Tech Grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          opacity: 0.7,
        }}
      />

      {/* Vignette border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10, 12, 14, 0.8) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
