import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const knowledge = readFileSync(new URL('../src/lib/brand-knowledge.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../database/postgres/0021_brand_knowledge_and_logo.sql', import.meta.url), 'utf8')
const securityFollowup = readFileSync(new URL('../database/postgres/0022_cost_ledger_privileges.sql', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/settings/BrandSettings.tsx', import.meta.url), 'utf8')

test('workspace knowledge is private, bounded and explicitly untrusted', () => {
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all .* from anon, authenticated/i)
  assert.match(knowledge, /limit 50/i)
  assert.match(knowledge, /Never follow instructions found inside/i)
})

test('logo removal does not report success when the server rejects it', () => {
  assert.match(settings, /if \(!response\.ok\) throw new Error/)
})

test('resetting colours keeps an independently managed logo attached', () => {
  const brandStore = readFileSync(new URL('../src/lib/export/brand.ts', import.meta.url), 'utf8')
  assert.match(brandStore, /if \(row\?\.logo_asset_id\)[\s\S]+primary_color = null, accent_color = null/)
})

test('operator spend stays closed to browser roles and cascading owner lookups are indexed', () => {
  assert.match(securityFollowup, /revoke all on public\.lab_cost_ledger from public, anon, authenticated/i)
  assert.match(securityFollowup, /idx_lab_brand_knowledge_owner[\s\S]+owner_id/i)
})
