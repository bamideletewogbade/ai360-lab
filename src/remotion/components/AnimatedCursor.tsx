import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { COLORS } from '../theme'

interface AnimatedCursorProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  startFrame: number
  durationFrames?: number
  clickFrame?: number
}

export const AnimatedCursor: React.FC<AnimatedCursorProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  startFrame,
  durationFrames = 25,
  clickFrame,
}) => {
  const frame = useCurrentFrame()

  const progress = interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2
  const currentX = fromX + (toX - fromX) * easeProgress
  const currentY = fromY + (toY - fromY) * easeProgress

  const isClicking = clickFrame && Math.abs(frame - clickFrame) < 6
  const scale = isClicking ? 0.8 : 1

  return (
    <div
      style={{
        position: 'absolute',
        top: currentY,
        left: currentX,
        transform: `scale(${scale})`,
        zIndex: 100,
        pointerEvents: 'none',
        transition: 'transform 0.1s ease',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
          fill="#101112"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {isClicking && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: -10,
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: `${COLORS.green}44`,
            border: `2px solid ${COLORS.greenLight}`,
            animation: 'ping 0.3s ease-out',
          }}
        />
      )}
    </div>
  )
}
