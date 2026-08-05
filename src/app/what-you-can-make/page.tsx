import type { Metadata } from 'next'
import { WhatYouCanMake } from '@/components/WhatYouCanMake'

export const metadata: Metadata = {
  title: 'What you can make',
  description:
    'Real work AI 360 Lab helps you finish: revision material, interview preparation, funding proposals, campaign artwork, policy briefs and short video.',
}

export default function WhatYouCanMakePage() {
  return <WhatYouCanMake />
}
