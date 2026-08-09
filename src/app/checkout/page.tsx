import type { Metadata } from 'next'
import { CheckoutExperience } from '@/components/CheckoutExperience'

export const metadata: Metadata = {
  title: 'Secure checkout | AI360 Lab',
  description: 'Review an AI360 plan and continue to secure ExpressPay checkout.',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan = '' } = await searchParams
  return <CheckoutExperience planSlug={plan} />
}
