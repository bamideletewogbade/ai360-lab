import React from 'react'
import { ScreenshotShowcase } from '../../components/ScreenshotShowcase'
import { AnimatedCursor } from '../../components/AnimatedCursor'
import { COLORS } from '../../theme'

export const Scene3ProjectsView: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ScreenshotShowcase
        imageName="projects.png"
        badgeText="Module 02 · Projects"
        badgeColor={COLORS.green}
        title="Start With the Outcome"
        subtitle="AI360 clarifies only the context that matters, tracks objectives in real time, and waits for your approval before execution."
        zoomOrigin="60% 50%"
        scaleFrom={1.0}
        scaleTo={1.07}
        panY={-12}
      />

      {/* Animated Cursor clicking 'Create first outputs →' */}
      <AnimatedCursor
        fromX={600}
        fromY={500}
        toX={1150}
        toY={760}
        startFrame={25}
        durationFrames={40}
        clickFrame={70}
      />
    </div>
  )
}
