'use client'

import React, { useState } from 'react'
import { Player } from '@remotion/player'
import { MainExplainer } from '@/remotion/compositions/MainExplainer/MainExplainer'
import { SocialShort } from '@/remotion/compositions/SocialShort/SocialShort'
import { FastDemo } from '@/remotion/compositions/FastDemo/FastDemo'
import { COLORS } from '@/remotion/theme'

const COMPOSITIONS = [
  {
    id: 'AI360Explainer',
    name: 'How to Use AI360 Africa (Product Walkthrough)',
    description: '58s Landscape (16:9 1080p) • Complete walkthrough using real screenshots: Chats, Projects, Media Studio & Tools',
    component: MainExplainer,
    durationInFrames: 1740,
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: '16 / 9',
  },
  {
    id: 'AI360SocialShort',
    name: 'Social Reel / TikTok / Shorts',
    description: '25s Vertical (9:16 1080x1920) • High-velocity kinetic reel for social media & WhatsApp Status',
    component: SocialShort,
    durationInFrames: 750,
    fps: 30,
    width: 1080,
    height: 1920,
    aspectRatio: '9 / 16',
  },
  {
    id: 'AI360FastDemo',
    name: 'Fast 30s Landing Page Demo',
    description: '30s Landscape (16:9 1080p) • Compact 3-step feature highlight for landing page hero',
    component: FastDemo,
    durationInFrames: 900,
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: '16 / 9',
  },
]

export default function VideoPreviewPage() {
  const [selectedCompId, setSelectedCompId] = useState('AI360Explainer')
  const current = COMPOSITIONS.find((c) => c.id === selectedCompId) || COMPOSITIONS[0]

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: COLORS.warmWhite,
        color: COLORS.black,
        fontFamily: '"Plus Jakarta Sans", "DM Sans", -apple-system, sans-serif',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Top Header */}
      <div style={{ maxWidth: 1200, width: '100%', marginBottom: 32, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: COLORS.white,
            border: `1px solid ${COLORS.lineDark}`,
            padding: '6px 18px',
            borderRadius: 20,
            color: COLORS.black,
            fontSize: 13,
            fontWeight: 800,
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(16, 17, 18, 0.05)',
          }}
        >
          <span>🎬 Remotion Studio · AI360 Africa</span>
        </div>

        <h1 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 10px 0', letterSpacing: '-0.04em' }}>
          How to Use AI360 Africa — Video Suite
        </h1>
        <p style={{ color: COLORS.charcoal, fontSize: 17, margin: 0 }}>
          Real product walkthrough featuring Chats, Projects, Media Studio, and Tools & Kits.
        </p>
      </div>

      {/* Composition Selector Tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          maxWidth: 1200,
          width: '100%',
          marginBottom: 32,
          justifyContent: 'center',
        }}
      >
        {COMPOSITIONS.map((comp) => {
          const isActive = comp.id === selectedCompId
          return (
            <button
              key={comp.id}
              onClick={() => setSelectedCompId(comp.id)}
              style={{
                backgroundColor: isActive ? COLORS.white : 'rgba(255, 255, 255, 0.6)',
                border: isActive ? `2px solid ${COLORS.black}` : `1px solid ${COLORS.line}`,
                borderRadius: 14,
                padding: '14px 22px',
                color: COLORS.black,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                boxShadow: isActive ? '0 8px 24px rgba(16, 17, 18, 0.1)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>{comp.name}</div>
              <div style={{ fontSize: 12, color: isActive ? COLORS.clay : COLORS.grey }}>
                {comp.description}
              </div>
            </button>
          )
        })}
      </div>

      {/* Video Player Container */}
      <div
        style={{
          maxWidth: current.id === 'AI360SocialShort' ? 460 : 1100,
          width: '100%',
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: COLORS.white,
          border: `1.5px solid ${COLORS.lineDark}`,
          boxShadow: '0 24px 70px rgba(16, 17, 18, 0.12)',
        }}
      >
        <Player
          component={current.component}
          durationInFrames={current.durationInFrames}
          compositionWidth={current.width}
          compositionHeight={current.height}
          fps={current.fps}
          style={{
            width: '100%',
            aspectRatio: current.aspectRatio,
          }}
          controls
          autoPlay={false}
          loop
        />
      </div>

      {/* Commands Cheat Sheet */}
      <div
        style={{
          marginTop: 40,
          maxWidth: 960,
          width: '100%',
          backgroundColor: COLORS.white,
          borderRadius: 18,
          border: `1px solid ${COLORS.line}`,
          padding: 26,
          boxShadow: '0 4px 20px rgba(16, 17, 18, 0.04)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.black, marginBottom: 14 }}>
          ⚡ CLI Render & Studio Commands
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={{ backgroundColor: COLORS.warmWhite, padding: 14, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Launch Remotion Studio:</div>
            <code style={{ fontSize: 13, color: COLORS.green, fontWeight: 700 }}>npm run video:dev</code>
          </div>
          <div style={{ backgroundColor: COLORS.warmWhite, padding: 14, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Render 1080p Main Walkthrough:</div>
            <code style={{ fontSize: 13, color: COLORS.green, fontWeight: 700 }}>npm run video:render</code>
          </div>
          <div style={{ backgroundColor: COLORS.warmWhite, padding: 14, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Render 9:16 Vertical Reel:</div>
            <code style={{ fontSize: 13, color: COLORS.green, fontWeight: 700 }}>npm run video:render:short</code>
          </div>
          <div style={{ backgroundColor: COLORS.warmWhite, padding: 14, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 12, color: COLORS.grey, marginBottom: 4 }}>Render 30s Fast Demo:</div>
            <code style={{ fontSize: 13, color: COLORS.green, fontWeight: 700 }}>npm run video:render:fast</code>
          </div>
        </div>
      </div>
    </div>
  )
}
