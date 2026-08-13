import { QualityConsole } from '@/components/QualityConsole'

export const metadata = {
  title: 'Quality Desk | AI360',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function QualityPage() {
  return <QualityConsole />
}

