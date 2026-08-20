import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/app/app/page.tsx', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/components/StudioWorkspace.tsx', import.meta.url), 'utf8')
const mobileNav = readFileSync(new URL('../src/components/MobileWorkspaceNav.tsx', import.meta.url), 'utf8')
const market = readFileSync(new URL('../src/components/Market.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('Library and Tools & Kits remain separate destinations on desktop and mobile', () => {
  assert.match(page, /<span>Library<\/span>/)
  assert.match(page, /<span>Tools &amp; Kits<\/span>/)
  assert.match(mobileNav, /<b>Library<\/b>/)
  assert.match(mobileNav, /<b>Tools &amp; Kits<\/b>/)
})

test('a Market choice is handed to the real Studio pack launcher', () => {
  assert.match(page, /setMarketPackRequest/)
  assert.match(page, /launchPackId=\{marketPackRequest\.id\}/)
  assert.match(page, /launchPackPrompt=\{marketPackRequest\.prompt\}/)
  assert.match(studio, /beginProject\(launchPackId, launchPackPrompt\)/)
})

test('Library and Market have explicit laptop-to-phone layout changes', () => {
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.market-container/)
  assert.match(css, /@media \(max-width: 590px\)[\s\S]*?\.market-grid \{ grid-template-columns: 1fr/)
  assert.match(css, /\.outcomes-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /\.outcomes-filter-bar button \{[\s\S]*?min-height: 44px/)
})

test('Tools and Kits uses the workspace width with a calm responsive discovery bar', () => {
  assert.match(css, /\.market-hero,[\s\S]*?width: 100%/)
  assert.match(css, /\.market-grid \{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.market-discovery \{ position: relative/)
  assert.match(market, /placeholder="Search tools and kits"/)
  assert.doesNotMatch(market, /placeholder="What do you need to get done\?"/)
  assert.doesNotMatch(page, /What do you need<br \/>to get done\?/)
})

test('tool cards use the workflow icon instead of repeating a category icon', () => {
  assert.match(market, /switch \(product\.packId\)/)
  for (const packId of ['learn', 'write', 'plan', 'research', 'decide', 'launch', 'naming', 'marketing', 'calendar', 'ads', 'pitch']) {
    assert.match(market, new RegExp(`case '${packId}'`))
  }
})
