import React from 'react'
import { ScreenshotShowcase } from '../../components/ScreenshotShowcase'
import { AnimatedCursor } from '../../components/AnimatedCursor'
import { COLORS } from '../../theme'

export const Scene2ChatsView: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ScreenshotShowcase
        imageName="chat.png"
        badgeText="Module 01 · Chats"
        badgeColor={COLORS.black}
        title="Ask, Write and Research"
        subtitle="Dump your thoughts freely. AI360 breaks complex topics into interactive structured chapters with source citations."
        zoomOrigin="50% 45%"
        scaleFrom={1.0}
        scaleTo={1.08}
        panY={-10}
      />

      {/* Animated Cursor pointing to Chapter Pills and Composer */}
      <AnimatedCursor
        fromX={350}
        fromY={400}
        toX={650}
        toY={520}
        startFrame={20}
        durationFrames={35}
        clickFrame={60}
      />
    </div>
  )
}
