import React from 'react'
import { Series } from 'remotion'
import { Scene1ProductIntro } from './Scene1ProductIntro'
import { Scene2ChatsView } from './Scene2ChatsView'
import { Scene3ProjectsView } from './Scene3ProjectsView'
import { Scene4MediaStudioView } from './Scene4MediaStudioView'
import { Scene5ToolsKitsView } from './Scene5ToolsKitsView'
import { Scene6PilotCTA } from './Scene6PilotCTA'

export const MainExplainer: React.FC = () => {
  return (
    <Series>
      {/* 01: Product Intro & Overview (5s = 150 frames) */}
      <Series.Sequence durationInFrames={150}>
        <Scene1ProductIntro />
      </Series.Sequence>

      {/* 02: Module 1 - Chats & Structured Chapters (11s = 330 frames) */}
      <Series.Sequence durationInFrames={330}>
        <Scene2ChatsView />
      </Series.Sequence>

      {/* 03: Module 2 - Projects: Start with the Outcome (12s = 360 frames) */}
      <Series.Sequence durationInFrames={360}>
        <Scene3ProjectsView />
      </Series.Sequence>

      {/* 04: Module 3 - Media Studio: Images & 4s Video (12s = 360 frames) */}
      <Series.Sequence durationInFrames={360}>
        <Scene4MediaStudioView />
      </Series.Sequence>

      {/* 05: Module 4 - Tools & Kits: 17 Starting Points (11s = 330 frames) */}
      <Series.Sequence durationInFrames={330}>
        <Scene5ToolsKitsView />
      </Series.Sequence>

      {/* 06: Pilot Outro & Call to Action (7s = 210 frames) */}
      <Series.Sequence durationInFrames={210}>
        <Scene6PilotCTA />
      </Series.Sequence>
    </Series>
  )
}
