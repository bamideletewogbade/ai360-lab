import { QualityConsole } from '@/components/QualityConsole'

export const metadata = {
  // The root layout's title template already appends "| AI360", so spelling it
  // out here rendered "Quality Desk | AI360 | AI360" in the browser tab.
  title: 'Quality Desk',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function QualityPage() {
  return <QualityConsole />
}

