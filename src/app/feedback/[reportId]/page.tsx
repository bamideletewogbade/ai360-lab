import { FeedbackStatus } from '@/components/FeedbackStatus'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'

export const metadata = {
  title: 'Quality report status | AI360 Lab',
  robots: { index: false, follow: false },
}

export default async function FeedbackStatusPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  return (
    <main>
      <SiteNav current="legal" />
      <FeedbackStatus reportId={reportId} />
      <SiteFooter />
    </main>
  )
}

