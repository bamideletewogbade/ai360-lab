import type { Metadata } from 'next'
import { LabLanding } from '@/components/LabLanding'

export const metadata: Metadata = {
  title: 'AI 360 Lab | Learn, create and get things done',
  description: 'Understand a topic, make a decision, build an idea or complete useful work with AI 360 Lab.',
}

export default function LandingPage() {
  return <LabLanding />
}
