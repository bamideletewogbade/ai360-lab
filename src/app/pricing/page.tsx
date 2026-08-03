import type { Metadata } from 'next'
import { PricingExperience } from '@/components/PricingExperience'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Affordable Ghana-first AI 360 Lab plans with Mobile Money and card payment options.',
}

export default function PricingPage() {
  return <PricingExperience />
}
