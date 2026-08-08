import { PricingExperience } from '@/components/PricingExperience'
import { publicPageMetadata } from '@/lib/seo'

export const metadata = publicPageMetadata({
  path: '/pricing',
  title: 'AI plans and pricing in Ghana',
  description: 'Compare AI360 Lab plans and work credits for research, documents and creative production, with Ghana-focused pricing and Mobile Money or card payment.',
  keywords: ['AI pricing Ghana', 'AI subscription Ghana', 'Mobile Money AI tools', 'AI360 Lab pricing'],
})

export default function PricingPage() {
  return <PricingExperience />
}
