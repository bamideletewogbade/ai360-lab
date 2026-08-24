import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AdminConsole } from '@/components/AdminConsole'
import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin Console',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const context = await getOptionalAuthContext()
  if (!context) redirect('/sign-in?next=%2Fadmin')
  if (!isAdminOperator(context)) notFound()
  return <AdminConsole />
}
