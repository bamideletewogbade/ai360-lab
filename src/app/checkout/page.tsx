import type { Metadata } from 'next'
import { CheckoutExperience } from '@/components/CheckoutExperience'

export const metadata: Metadata = {
  // The layout's template appends "| AI360" to every child route, so naming it
  // here rendered "Secure checkout | AI360 | AI360".
  title: 'Secure checkout',
  description: 'Review an AI360 plan and continue to secure ExpressPay checkout.',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; topup?: string }> }) {
  const { plan = '', topup = '' } = await searchParams
  return <CheckoutExperience planSlug={plan} topupSlug={topup} />
}
