import { redirect } from 'next/navigation'
import { LabLanding } from '@/components/LabLanding'
import { getOptionalAuthContext, isAuthConfigured } from '@/lib/auth'
import { publicPageMetadata } from '@/lib/seo'

// The signed-in redirect below reads the request's session, so this page must
// be evaluated per request. Without this it can be statically prerendered with
// no user, caching the marketing landing and serving it to signed-in people
// too — which is exactly the "why am I not in my workspace" problem.
export const dynamic = 'force-dynamic'

export const metadata = publicPageMetadata({
  path: '',
  title: 'AI360 | AI research, planning and creative tools',
  description: 'Research current information, understand difficult topics, prepare proposals and create campaigns with AI360, a practical AI workspace built from Accra.',
  keywords: ['AI360', 'AI assistant Ghana', 'AI research tools Africa', 'AI campaign generator', 'AI proposal writer'],
  absoluteTitle: true,
})

/**
 * A signed-in person has already been sold. Sending them to the marketing home
 * instead of their workspace, which is what happened before, loses the work
 * they came back to continue. So the front door routes them straight to /app,
 * which restores their last conversation. Prospects and crawlers still get the
 * full landing page. Marketing pages like /pricing stay reachable by direct link.
 */
export default async function LandingPage() {
  if (isAuthConfigured()) {
    const context = await getOptionalAuthContext()
    if (context) redirect('/app')
  }
  return <LabLanding />
}
