import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  subtitle?: string
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showTagline = true,
  subtitle = 'Built with Accra Innovation Centre',
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = customSpring(frame, fps, 0, SPRINGS.bouncy)
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  const fontSize = size === 'lg' ? 72 : size === 'md' ? 44 : 28
  const markSize = size === 'lg' ? 64 : size === 'md' ? 40 : 24

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Geometric 360 Ring Brand Mark */}
        <div
          style={{
            width: markSize,
            height: markSize,
            borderRadius: '28%',
            background: `linear-gradient(135deg, ${COLORS.greenLight}, ${COLORS.clay})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 30px ${COLORS.greenGlow}`,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: markSize * 0.55,
              height: markSize * 0.55,
              borderRadius: '50%',
              border: '3px solid white',
              borderRightColor: 'transparent',
              transform: `rotate(${frame * 2}deg)`,
            }}
          />
        </div>

        {/* Brand Text */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span
            style={{
              fontSize,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: COLORS.white,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            AI<span style={{ color: COLORS.greenLight }}>360</span>
          </span>
          <span
            style={{
              fontSize: fontSize * 0.45,
              fontWeight: 600,
              color: COLORS.clayLight,
              marginLeft: 4,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Africa
          </span>
        </div>
      </div>

      {showTagline && (
        <div
          style={{
            marginTop: 10,
            fontSize: size === 'lg' ? 20 : 14,
            fontWeight: 500,
            color: COLORS.textMuted,
            letterSpacing: '0.02em',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}
