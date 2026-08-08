import { WhatYouCanMake } from '@/components/WhatYouCanMake'
import { publicPageMetadata } from '@/lib/seo'

export const metadata = publicPageMetadata({
  path: '/what-you-can-make',
  title: 'AI tools for research, proposals, study and campaigns',
  description: 'See practical AI360 Lab examples for revision materials, interview preparation, funding proposals, campaign artwork, policy briefs and short videos.',
  keywords: ['AI proposal writer Ghana', 'AI study assistant', 'AI campaign creator', 'AI policy brief', 'AI video generator Africa'],
})

export default function WhatYouCanMakePage() {
  return <WhatYouCanMake />
}
