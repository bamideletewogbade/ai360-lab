import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { CohortDashboard } from '@/components/CohortDashboard'
import { getOptionalAuthContext } from '@/lib/auth'
import { isPilotOperator } from '@/lib/pilot/access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pilot Cohorts',
  robots: { index: false, follow: false },
}

export default async function PilotCohortsPage() {
  const context = await getOptionalAuthContext()
  if (!context) redirect('/sign-in?next=%2Fpilot')
  if (!isPilotOperator(context)) notFound()

  return <CohortDashboard />
}
