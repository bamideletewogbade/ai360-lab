import type { Metadata } from 'next'
import { PilotWelcome } from '@/components/PilotWelcome'
import { safeInternalPath } from '@/lib/auth-callback'

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const requested = (await searchParams).next
  const next = safeInternalPath(Array.isArray(requested) ? requested[0] : requested, '/app')
  return <PilotWelcome next={next} />
}
