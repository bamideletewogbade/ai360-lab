import { LandingHero } from '@/components/LandingHero'
import {
  LandingCapabilities, LandingMission, LandingOutcomes, LandingProcess, LandingProof,
} from '@/components/LandingSections'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'

export function LabLanding() {
  return (
    <main className="landing-shell">
      <SiteNav current="home" />
      <LandingHero />
      <LandingProof />
      <LandingMission />
      <LandingOutcomes />
      <LandingCapabilities />
      <LandingProcess />
      <SiteFooter />
    </main>
  )
}
