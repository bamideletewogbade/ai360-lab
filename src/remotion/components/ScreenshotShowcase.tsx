import React from 'react'
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, customSpring, SPRINGS } from '../theme'

interface ScreenshotShowcaseProps {
  imageName: 'chat.png' | 'projects.png' | 'media-studio.png' | 'tools-kits.png'
  title: string
  subtitle: string
  badgeText: string
  badgeColor?: string
  zoomOrigin?: string
  scaleFrom?: number
  scaleTo?: number
  panX?: number
  panY?: number
}

export const ScreenshotShowcase: React.FC<ScreenshotShowcaseProps> = ({
  imageName,
  title,
  subtitle,
  badgeText,
  badgeColor = COLORS.green,
  zoomOrigin = 'center center',
  scaleFrom = 1,
  scaleTo = 1.06,
  panX = 0,
  panY = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const cardScale = customSpring(frame, fps, 0, SPRINGS.smooth)
  const imageScale = interpolate(frame, [0, durationInFrames], [scaleFrom, scaleTo], {
    extrapolateRight: 'clamp',
  })

  const badgeSpring = customSpring(frame, fps, 8, SPRINGS.snappy)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: COLORS.warmWhite,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 40px',
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner & Badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: 1480,
          marginBottom: 16,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                transform: `scale(${badgeSpring})`,
                fontSize: 12,
                fontWeight: 800,
                color: COLORS.white,
                backgroundColor: badgeColor,
                padding: '4px 12px',
                borderRadius: 20,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(16, 17, 18, 0.15)',
              }}
            >
              {badgeText}
            </span>
            <span style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, letterSpacing: '-0.03em' }}>
              {title}
            </span>
          </div>
          <div style={{ fontSize: 14, color: COLORS.grey, marginTop: 4, fontWeight: 500 }}>
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: COLORS.white,
            padding: '6px 16px',
            borderRadius: 12,
            border: `1px solid ${COLORS.lineDark}`,
            boxShadow: '0 2px 8px rgba(16, 17, 18, 0.04)',
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.green }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.black }}>ai360.africa/app</span>
          <span style={{ fontSize: 12, color: COLORS.grey }}>· Private Pilot</span>
        </div>
      </div>

      {/* Browser Window Frame with Real Screenshot */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1480,
          height: 820,
          backgroundColor: '#101112',
          borderRadius: 18,
          overflow: 'hidden',
          border: `1px solid ${COLORS.lineDark}`,
          boxShadow: '0 24px 80px rgba(16, 17, 18, 0.22), 0 0 0 1px rgba(16, 17, 18, 0.08)',
          transform: `scale(${cardScale})`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Browser Topbar */}
        <div
          style={{
            height: 38,
            backgroundColor: '#1f2226',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#27c93f' }} />
          </div>

          <div
            style={{
              fontSize: 12,
              color: '#9b9d9f',
              backgroundColor: '#14171a',
              padding: '2px 24px',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            https://ai360.africa/app
          </div>

          <div style={{ width: 40 }} />
        </div>

        {/* Real Screenshot with Smooth Zoom & Pan */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#101112',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              transformOrigin: zoomOrigin,
              transform: `scale(${imageScale}) translate(${panX}px, ${panY}px)`,
              transition: 'transform 0.1s linear',
            }}
          >
            <Img
              src={staticFile(`screenshots/${imageName}`)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
