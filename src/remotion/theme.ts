import { spring, SpringConfig } from 'remotion'

export const COLORS = {
  // Official AI360 Africa Design Tokens (from globals.css & landing.css)
  black: '#101112',
  charcoal: '#292b2d',
  grey: '#56595c',
  softGrey: '#b8babd',
  warmWhite: '#f7f6f2',
  paper: '#fbfaf7',
  white: '#ffffff',
  line: '#e3e1da',
  lineDark: '#cfcdc5',
  landingHairline: '#cbc6bc',
  landingBand: '#e9e5dc',

  // Semantic Accents
  green: '#436a55',
  greenLight: '#5fa784',
  greenGlow: 'rgba(67, 106, 85, 0.18)',
  greenBg: '#eef4f0',
  violet: '#735d87',
  violetLight: '#a98fc0',
  clay: '#a6633e',
  clayLight: '#c2784e',
  clayBg: '#faf2ed',

  // Dark Workspace Tokens (Sidebar & Dark panels)
  sidebarBg: '#101112',
  sidebarHover: '#1c1e21',
  sidebarBorder: 'rgba(255, 255, 255, 0.08)',
  sidebarText: '#f7f6f2',
  sidebarMuted: '#9b9d9f',

  // Backward Compatible Aliases
  bgDark: '#101112',
  bgSurface: '#14171a',
  bgCard: 'rgba(28, 32, 37, 0.75)',
  bgGlass: 'rgba(255, 255, 255, 0.05)',
  borderGlass: 'rgba(255, 255, 255, 0.12)',
  borderActive: 'rgba(67, 106, 85, 0.5)',
  textMuted: '#56595c',
  textDim: '#b8babd',
  textBright: '#101112',
}

export const SPRINGS = {
  snappy: { damping: 14, mass: 0.6, stiffness: 120 } as SpringConfig,
  smooth: { damping: 22, mass: 1, stiffness: 90 } as SpringConfig,
  bouncy: { damping: 12, mass: 0.8, stiffness: 130 } as SpringConfig,
  gentle: { damping: 28, mass: 1.2, stiffness: 75 } as SpringConfig,
}

export function customSpring(frame: number, fps: number, delay: number = 0, config: SpringConfig = SPRINGS.smooth) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config,
  })
}
