import { redirect } from 'next/navigation'
import { DEFAULT_SETTINGS_SECTION, settingsPath } from '@/lib/settings-sections'

/** `/settings` is a shortcut people will type or bookmark; land it on a section. */
export default function SettingsIndexPage() {
  redirect(settingsPath(DEFAULT_SETTINGS_SECTION))
}
