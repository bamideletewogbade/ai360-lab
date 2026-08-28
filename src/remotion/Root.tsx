import React from 'react'
import { Composition, Still } from 'remotion'
import { MainExplainer } from './compositions/MainExplainer/MainExplainer'
import { SocialShort } from './compositions/SocialShort/SocialShort'
import { FastDemo } from './compositions/FastDemo/FastDemo'
import { AUDIENCE_IDS, AUDIENCES, FORMAT_IDS, FORMATS } from './campaign/audiences'
import { PilotAd, PILOT_AD_DURATION } from './campaign/PilotAd'
import { PilotCarousel, PilotPoster } from './campaign/PilotStills'

const STILL_WIDTH = 1080
const STILL_HEIGHT = 1350

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ================== Product walkthroughs (existing) ================== */}

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

      {/* =========== Pilot recruitment campaign (4 audience doors) =========== */}

      {/* 20s ad — every audience × every format */}
      {AUDIENCE_IDS.map((audience) =>
        FORMAT_IDS.map((format) => (
          <Composition
            key={`PilotAd-${audience}-${format}`}
            id={`PilotAd-${audience}-${format}`}
            component={PilotAd}
            durationInFrames={PILOT_AD_DURATION}
            fps={30}
            width={FORMATS[format].width}
            height={FORMATS[format].height}
            defaultProps={{ audience }}
          />
        ))
      )}

      {/* Single-image poster per audience (1080×1350) */}
      {AUDIENCE_IDS.map((audience) => (
        <Still
          key={`PilotPoster-${audience}`}
          id={`PilotPoster-${audience}`}
          component={PilotPoster}
          width={STILL_WIDTH}
          height={STILL_HEIGHT}
          defaultProps={{ audience }}
        />
      ))}

      {/* Carousel frames per audience (1080×1350) */}
      {AUDIENCE_IDS.flatMap((audience) =>
        AUDIENCES[audience].carousel.map((_slide, index) => (
          <Still
            key={`PilotCarousel-${audience}-${index + 1}`}
            id={`PilotCarousel-${audience}-${index + 1}`}
            component={PilotCarousel}
            width={STILL_WIDTH}
            height={STILL_HEIGHT}
            defaultProps={{ audience, index }}
          />
        ))
      )}
    </>
  )
}
