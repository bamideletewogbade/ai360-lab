import type { Metadata } from 'next'
import { CheckoutExperience } from '@/components/CheckoutExperience'

export const metadata: Metadata = {
  title: 'Secure checkout | AI360',
  description: 'Review an AI360 plan and continue to secure ExpressPay checkout.',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; topup?: string }> }) {
  const { plan = '', topup = '' } = await searchParams
  return <CheckoutExperience planSlug={plan} topupSlug={topup} />
}
