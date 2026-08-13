/**
 * The settings sections, in one place.
 *
 * Settings moved from a fixed 720x540 dialog to real routes. A multi-section
 * surface with async billing data is not a task someone opens and resolves in
 * seconds, so it earns a page: it can be deep linked, bookmarked, shared with
 * support, and it reads as a native full screen on a phone, which is where most
 * of AI360's people are.
 *
 * Kept pure and dependency free so route validation and navigation share one
 * definition and it can be unit tested directly.
 */

export type SettingsSection = 'general' | 'billing' | 'account'

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'general'

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection
  label: string
  detail: string
  title: string
}> = [
  { id: 'general', label: 'General', detail: 'Appearance and language', title: 'General' },
  { id: 'billing', label: 'Credits & Billing', detail: 'Balance, plan and payments', title: 'Credits & Billing' },
  { id: 'account', label: 'Account', detail: 'Identity, privacy and data', title: 'Account' },
]

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value)
}

export function settingsSectionTitle(section: SettingsSection) {
  return SETTINGS_SECTIONS.find((item) => item.id === section)?.title ?? 'Settings'
}

export function settingsPath(section: SettingsSection) {
  return `/settings/${section}`
}
