import { LabLanding } from '@/components/LabLanding'
import { publicPageMetadata } from '@/lib/seo'

export const metadata = publicPageMetadata({
  path: '',
  title: 'AI360 Lab | AI research, planning and creative tools',
  description: 'Research current information, understand difficult topics, prepare proposals and create campaigns with AI360 Lab, a practical AI workspace built from Accra.',
  keywords: ['AI360', 'AI assistant Ghana', 'AI research tools Africa', 'AI campaign generator', 'AI proposal writer'],
  absoluteTitle: true,
})

export default function LandingPage() {
  return <LabLanding />
}
