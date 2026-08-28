/**
 * AI360 Africa — Pilot Campaign audience configuration.
 *
 * One entry per "audience door". Every video, poster and carousel frame in the
 * campaign is generated from this file, so changing copy here changes every
 * asset for that audience. Keep the copy concrete and plain — no abstractions.
 */

import { COLORS } from '../theme'

export type AudienceId = 'careers' | 'corporate' | 'kids' | 'educators'

export interface CarouselFrameCopy {
  kicker: string
  headline: string
  body: string
}

export interface Audience {
  id: AudienceId
  /** Short label used in filenames and badges */
  label: string
  /** Badge line above the headline */
  eyebrow: string
  /** The hook — the problem, in their words */
  hook: string
  /** Main promise */
  headline: string
  /** One-line support under the headline */
  subhead: string
  /** Three concrete things they will actually do in the pilot */
  proof: { icon: string; title: string; detail: string }[]
  /** What a pilot tester gives and gets */
  pilotOffer: string[]
  /** Final line above the URL */
  ctaLine: string
  /** Accent colour pulled from the AI360 token set */
  accent: string
  accentBg: string
  /** 5-frame carousel narrative */
  carousel: CarouselFrameCopy[]
}

export const CTA_URL = 'ai360.africa'
export const CTA_ACTION = 'Sign up free — pilot testers get added automatically'

export const AUDIENCES: Record<AudienceId, Audience> = {
  careers: {
    id: 'careers',
    label: 'Career Starters',
    eyebrow: 'FOR STUDENTS & RECENT GRADUATES',
    hook: 'Everyone says "learn AI". Nobody shows you what to actually do with it.',
    headline: 'Finish real work with AI — not another certificate',
    subhead:
      'Write the application, build the portfolio piece, research the industry. In one workspace.',
    proof: [
      {
        icon: '💬',
        title: 'Ask and research',
        detail: 'Answers with sources you can check, not guesses',
      },
      {
        icon: '📁',
        title: 'Start with the outcome',
        detail: 'A CV, a proposal, a pitch — say what you need, work backwards',
      },
      {
        icon: '🖼️',
        title: 'Make the visuals',
        detail: 'Images and short video for the portfolio you are building',
      },
    ],
    pilotOffer: [
      'Free access during the pilot',
      'You tell us what breaks',
      'Limited seats, first term',
    ],
    ctaLine: 'Join the AI360 Africa pilot',
    accent: COLORS.green,
    accentBg: COLORS.greenBg,
    carousel: [
      {
        kicker: 'THE GAP',
        headline: 'You have done the AI course. Now what?',
        body: 'Knowing what a prompt is does not get the job. Producing work does.',
      },
      {
        kicker: 'AI360 AFRICA',
        headline: 'A workspace, not a chatbot',
        body: 'Chats, Projects, Media Studio and 17 ready-made Tools & Kits in one place.',
      },
      {
        kicker: 'WHAT YOU DO IN WEEK ONE',
        headline: 'Three things, finished',
        body: 'Research an industry with citations. Build a portfolio piece. Draft the application.',
      },
      {
        kicker: 'THE PILOT',
        headline: 'Free seats, in exchange for honest feedback',
        body: 'You use it for real work. You tell us what is confusing, slow or wrong. We fix it.',
      },
      {
        kicker: 'HOW TO JOIN',
        headline: 'Sign up at ai360.africa',
        body: 'Create your free account and you are added to the pilot group. Limited seats for the first cohort.',
      },
    ],
  },

  corporate: {
    id: 'corporate',
    label: 'Teams & Employers',
    eyebrow: 'FOR TEAMS & EMPLOYERS',
    hook: 'Your team is already using AI. Nobody knows what it is costing you.',
    headline: 'Put your team on one AI workspace — with the costs visible',
    subhead:
      'Shared projects, verified sources, and spend you can actually see. Built in Accra.',
    proof: [
      {
        icon: '🔒',
        title: 'Verified citations',
        detail: 'Every claim traceable — safe to put in front of a client',
      },
      {
        icon: '⚡',
        title: 'Zero silent costs',
        detail: 'Credits and spend caps per seat, visible before you commit',
      },
      {
        icon: '🎛️',
        title: '17 Tools & Kits',
        detail: 'Proposals, reports, briefs — starting points your team can reuse',
      },
    ],
    pilotOffer: [
      'Pilot pricing for the first cohort',
      'Onboarding for your team',
      'Direct line to the build team',
    ],
    ctaLine: 'Put your team in the pilot',
    accent: COLORS.violet,
    accentBg: '#f2eff6',
    carousel: [
      {
        kicker: 'THE PROBLEM',
        headline: 'Shadow AI is already in your business',
        body: 'Different tools, personal accounts, no record of what was produced or what it cost.',
      },
      {
        kicker: 'AI360 AFRICA',
        headline: 'One workspace your team shares',
        body: 'Chats, Projects, Media Studio and Tools & Kits — under one account, one bill.',
      },
      {
        kicker: 'WHAT CHANGES',
        headline: 'Output you can defend',
        body: 'Verified citations on research. Spend caps per seat. No silent costs at month end.',
      },
      {
        kicker: 'THE PILOT',
        headline: 'First cohort, pilot pricing',
        body: 'We onboard your team, you use it on live work, and you tell us what is missing.',
      },
      {
        kicker: 'HOW TO JOIN',
        headline: 'Sign up at ai360.africa',
        body: 'Create your account and you are added to the pilot group. Limited team seats.',
      },
    ],
  },

  kids: {
    id: 'kids',
    label: 'Kids & Parents',
    eyebrow: 'FOR PARENTS',
    hook: 'Your child will use AI. The question is whether they use it well.',
    headline: 'Teach your child to build with AI, not just ask it for answers',
    subhead:
      'Guided, age-banded projects where the child makes something and explains how.',
    proof: [
      {
        icon: '🧠',
        title: 'Understanding first',
        detail: 'Age-appropriate lessons on how AI works and where it gets things wrong',
      },
      {
        icon: '🎨',
        title: 'They make things',
        detail: 'Stories, images and small projects the child finishes and shows you',
      },
      {
        icon: '👀',
        title: 'You can see the work',
        detail: 'Every project is saved — you see what they did, not just the output',
      },
    ],
    pilotOffer: [
      'Free pilot seats for families',
      'Small first cohort',
      'Your feedback shapes the age bands',
    ],
    ctaLine: 'Put your child in the pilot cohort',
    accent: COLORS.clay,
    accentBg: COLORS.clayBg,
    carousel: [
      {
        kicker: 'THE WORRY',
        headline: '"Is AI going to do my child\'s homework for them?"',
        body: 'It will, if nobody teaches them the difference between using a tool and hiding behind one.',
      },
      {
        kicker: 'AI360 AFRICA · KIDS',
        headline: 'Guided projects, age by age',
        body: 'Children learn how AI works, where it is wrong, and how to build something real with it.',
      },
      {
        kicker: 'WHAT THEY MAKE',
        headline: 'A finished thing, every session',
        body: 'A story, an illustration, a small project — and they explain how they made it.',
      },
      {
        kicker: 'THE PILOT',
        headline: 'A small first cohort',
        body: 'Free seats for pilot families. Your feedback sets the age bands and the pace.',
      },
      {
        kicker: 'HOW TO JOIN',
        headline: 'Sign up at ai360.africa',
        body: 'Create a free account and you are added to the pilot group. Limited family seats.',
      },
    ],
  },

  educators: {
    id: 'educators',
    label: 'Educators & Institutions',
    eyebrow: 'FOR SCHOOLS & TRAINING PARTNERS',
    hook: 'Banning AI in the classroom did not work. Teaching it has to.',
    headline: 'An AI curriculum your institution can actually run',
    subhead:
      'Mapped to the UNESCO AI Competency Framework and the OECD-EC AILit Framework.',
    proof: [
      {
        icon: '📚',
        title: 'Framework-anchored',
        detail: 'UNESCO (2024) and OECD-EC AILit (2025) competencies, mapped course by course',
      },
      {
        icon: '🎛️',
        title: 'Ready to teach',
        detail: 'Course catalogue with durations, timings and assessment built in',
      },
      {
        icon: '🤝',
        title: 'Delivered with you',
        detail: 'Run it in your institution, with AIC and 2nd Generation Technology',
      },
    ],
    pilotOffer: [
      'Partner rates for the first term',
      '3–4 lean pilot cohorts',
      'Curriculum shaped by your feedback',
    ],
    ctaLine: 'Bring the pilot to your institution',
    accent: COLORS.green,
    accentBg: COLORS.greenBg,
    carousel: [
      {
        kicker: 'THE REALITY',
        headline: 'Your students are using AI whether you allow it or not',
        body: 'The choice is not adoption or no adoption. It is taught or untaught.',
      },
      {
        kicker: 'AI360 AFRICA',
        headline: 'A curriculum, not a tool demo',
        body: 'Anchored to the UNESCO AI Competency Framework (2024) and OECD-EC AILit (2025).',
      },
      {
        kicker: 'WHAT YOU GET',
        headline: 'Something you can timetable',
        body: 'A course catalogue with durations, timings, fees and assessment — plus the workspace itself.',
      },
      {
        kicker: 'THE PILOT',
        headline: '3–4 cohorts, first term',
        body: 'Partner rates while we run it together, and your feedback shapes the catalogue.',
      },
      {
        kicker: 'HOW TO JOIN',
        headline: 'Sign up at ai360.africa',
        body: 'Create an account and you are added to the pilot group. Limited partner places.',
      },
    ],
  },
}

export const AUDIENCE_IDS = Object.keys(AUDIENCES) as AudienceId[]

/** Canvas formats the campaign renders to. */
export const FORMATS = {
  reel: { width: 1080, height: 1920, label: 'Reel 9:16' },
  square: { width: 1080, height: 1080, label: 'Square 1:1' },
  wide: { width: 1920, height: 1080, label: 'Wide 16:9' },
} as const

export type FormatId = keyof typeof FORMATS
export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[]
