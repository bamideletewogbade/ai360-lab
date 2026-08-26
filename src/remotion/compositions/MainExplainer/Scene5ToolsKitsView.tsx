import React from 'react'
import { ScreenshotShowcase } from '../../components/ScreenshotShowcase'
import { AnimatedCursor } from '../../components/AnimatedCursor'
import { COLORS } from '../../theme'

export const Scene5ToolsKitsView: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ScreenshotShowcase
        imageName="tools-kits.png"
        badgeText="Module 04 · Tools & Kits"
        badgeColor={COLORS.violet}
        title="17 Guided Starting Points"
        subtitle="Turn broad ideas into structured projects. Ready-to-use kits for study, exams, research, career, scholarship, and business."
        zoomOrigin="50% 65%"
        scaleFrom={1.0}
        scaleTo={1.08}
        panY={-12}
      />

      {/* Animated Cursor browsing study kits */}
      <AnimatedCursor
        fromX={400}
        fromY={500}
        toX={650}
        toY={700}
        startFrame={25}
        durationFrames={40}
        clickFrame={70}
      />
    </div>
  )
}
