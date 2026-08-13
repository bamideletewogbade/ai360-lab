import { HowItWorks } from '@/components/HowItWorks'
import { publicPageMetadata } from '@/lib/seo'

export const metadata = publicPageMetadata({
  path: '/how-it-works',
  title: 'How AI360 works',
  description: 'Learn how AI360 routes tasks, researches current sources, handles approvals, protects your control and turns goals into usable outcomes.',
  keywords: ['how AI agents work', 'AI research with sources', 'human approval AI', 'AI360 workflow'],
})

export default function HowItWorksPage() {
  return <HowItWorks />
}
