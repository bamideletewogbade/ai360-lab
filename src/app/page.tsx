import type { Metadata } from 'next'
import { LabLanding } from '@/components/LabLanding'

export const metadata: Metadata = {
  title: 'AI 360 Lab | Bring the goal. Leave ready to move.',
  description: 'Understand what matters, decide with evidence, create with confidence and finish the work with AI 360 Lab.',
}

export default function LandingPage() {
  return <LabLanding />
}
