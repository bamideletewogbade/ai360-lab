import type { Metadata } from 'next'
import { PaymentStatus } from '@/components/PaymentStatus'

export const metadata: Metadata = {
  title: 'Payment status | AI360 Lab',
  robots: { index: false, follow: false },
}

export default async function PaymentStatusPage({ searchParams }: { searchParams: Promise<{ order?: string; check?: string }> }) {
  const { order = '', check } = await searchParams
  return <PaymentStatus orderId={order} check={check} />
}
