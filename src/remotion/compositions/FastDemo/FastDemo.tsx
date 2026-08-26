import React from 'react'
import { Series } from 'remotion'
import { Scene1Hook } from '../MainExplainer/Scene1Hook'
import { Scene2ThreeWays } from '../MainExplainer/Scene2ThreeWays'
import { Scene5StudioPack } from '../MainExplainer/Scene5StudioPack'
import { Scene7PilotOutro } from '../MainExplainer/Scene7PilotOutro'

export const FastDemo: React.FC = () => {
  return (
    <Series>
      {/* 01: Authentic Hook (4s = 120 frames) */}
      <Series.Sequence durationInFrames={120}>
        <Scene1Hook />
      </Series.Sequence>

      {/* 02: 3 Ways to Work (8s = 240 frames) */}
      <Series.Sequence durationInFrames={240}>
        <Scene2ThreeWays />
      </Series.Sequence>

      {/* 03: Studio Deliverables (10s = 300 frames) */}
      <Series.Sequence durationInFrames={300}>
        <Scene5StudioPack />
      </Series.Sequence>

      {/* 04: Pilot CTA (8s = 240 frames) */}
      <Series.Sequence durationInFrames={240}>
        <Scene7PilotOutro />
      </Series.Sequence>
    </Series>
  )
}
