import type { WorkspaceAuthContext } from '@/lib/workspace'

export const READ_ONLY_BROWSER_LIMITS = {
  maxDurationSeconds: 300,
  maxActions: 30,
  maxScreenshots: 12,
  maxDownloads: 3,
  maxDownloadBytes: 10 * 1024 * 1024,
  viewport: { width: 1280, height: 800 },
} as const

function configured(name: string) {
  return Boolean(process.env[name]?.trim())
}

function pilotUsers() {
  return new Set((process.env.AI360_BROWSER_PILOT_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))
}

export function browserAllowedDomains() {
  return [...new Set((process.env.AI360_BROWSER_ALLOWED_DOMAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
    .filter((value) => /^[a-z0-9.-]+$/.test(value) && value.includes('.')))]
}

export function browserPilotConfiguration() {
  const enabled = process.env.AI360_BROWSER_PILOT_ENABLED === 'true'
  const provider = process.env.AI360_BROWSER_PROVIDER || 'browserbase'
  const providerReady = provider === 'browserbase'
    && configured('BROWSERBASE_API_KEY')
    && configured('BROWSERBASE_PROJECT_ID')
  const scopeReady = pilotUsers().size > 0 && browserAllowedDomains().length > 0
  return {
    enabled,
    provider,
    providerReady,
    scopeReady,
    ready: enabled && providerReady && scopeReady && configured('DATABASE_URL'),
  }
}

export function browserNavigationConfiguration() {
  const pilot = browserPilotConfiguration()
  const functionReady = configured('BROWSERBASE_NAVIGATE_FUNCTION_ID')
  const storageReady = configured('NEXT_PUBLIC_SUPABASE_URL')
    && configured('SUPABASE_SECRET_KEY')
    && configured('SUPABASE_PRIVATE_BUCKET')
    && configured('AI360_BROWSER_CLEANUP_SECRET')
  return {
    ...pilot,
    functionReady,
    storageReady,
    ready: pilot.ready && functionReady && storageReady,
  }
}

export function canUseBrowserPilot(context: WorkspaceAuthContext | null) {
  if (!context || !browserPilotConfiguration().ready) return false
  return pilotUsers().has(context.userId)
}
