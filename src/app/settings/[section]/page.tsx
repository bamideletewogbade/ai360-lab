import { notFound } from 'next/navigation'
import { AccountSettings } from '@/components/settings/AccountSettings'
import { BillingSettings } from '@/components/settings/BillingSettings'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { isSettingsSection, SETTINGS_SECTIONS, settingsSectionTitle } from '@/lib/settings-sections'

export function generateStaticParams() {
  return SETTINGS_SECTIONS.map((section) => ({ section: section.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const title = isSettingsSection(section) ? settingsSectionTitle(section) : 'Settings'
  return { title: `${title} | AI360`, robots: { index: false, follow: false } }
}

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!isSettingsSection(section)) notFound()

  if (section === 'billing') return <BillingSettings />
  if (section === 'account') return <AccountSettings />
  return <GeneralSettings />
}
