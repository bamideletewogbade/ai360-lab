import React from 'react'
import { Composition } from 'remotion'
import { MainExplainer } from './compositions/MainExplainer/MainExplainer'
import { SocialShort } from './compositions/SocialShort/SocialShort'
import { FastDemo } from './compositions/FastDemo/FastDemo'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1. Main Authentic How-to Walkthrough (16:9 Landscape, 58s @ 30fps) */}
      <Composition
        id="AI360Explainer"
        component={MainExplainer}
        durationInFrames={1740}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 2. Social Reel / TikTok / Shorts (9:16 Vertical, 25s @ 30fps) */}
      <Composition
        id="AI360SocialShort"
        component={SocialShort}
        durationInFrames={750}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 3. Fast Landing Page Demo (16:9 Landscape, 30s @ 30fps) */}
      <Composition
        id="AI360FastDemo"
        component={FastDemo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  )
}
