import type { Metadata } from 'next'
import { HowItWorks } from '@/components/HowItWorks'

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'What happens between asking and receiving in AI 360 Lab: model routing, approvals, what a credit buys, and the things the Lab deliberately will not do.',
}

export default function HowItWorksPage() {
  return <HowItWorks />
}
