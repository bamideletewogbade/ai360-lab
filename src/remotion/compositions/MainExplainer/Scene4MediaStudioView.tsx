import React from 'react'
import { ScreenshotShowcase } from '../../components/ScreenshotShowcase'
import { AnimatedCursor } from '../../components/AnimatedCursor'
import { COLORS } from '../../theme'

export const Scene4MediaStudioView: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ScreenshotShowcase
        imageName="media-studio.png"
        badgeText="Module 03 · Media Studio"
        badgeColor={COLORS.clay}
        title="Create Images and Short Videos"
        subtitle="Generate photorealistic product shots, food plates, store fronts, and 4s vertical MP4 videos with instant prompt reuse."
        zoomOrigin="50% 60%"
        scaleFrom={1.0}
        scaleTo={1.08}
        panY={-15}
      />

      {/* Animated Cursor selecting prompt suggestions */}
      <AnimatedCursor
        fromX={800}
        fromY={300}
        toX={500}
        toY={280}
        startFrame={20}
        durationFrames={35}
        clickFrame={60}
      />
    </div>
  )
}
