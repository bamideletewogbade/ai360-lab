import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/app/app/page.tsx', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/components/StudioWorkspace.tsx', import.meta.url), 'utf8')
const mobileNav = readFileSync(new URL('../src/components/MobileWorkspaceNav.tsx', import.meta.url), 'utf8')
const market = readFileSync(new URL('../src/components/Market.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('the tab bar carries four primary destinations rather than an overflow menu', () => {
  const tabs = [...mobileNav.matchAll(/<NavIcon kind="\w+" \/><span>([^<]+)<\/span>/g)].map((match) => match[1])
  // The catalogue sits after the work surfaces: "Examples are secondary".
  assert.deepEqual(tabs, ['Chats', 'Projects', 'Media', 'Tools'])
  // The "More" sheet is gone. Everything it held has a home: search, recents,
  // settings and help in the drawer, identity in the header.
  assert.doesNotMatch(mobileNav, /mobile-workspace-sheet|role="dialog"/)
})

test('the sidebar offers the same destinations in the same order as the tab bar', () => {
  const menu = page.slice(page.indexOf('nav-main-menu'), page.indexOf('recents-section-head'))
  // Commented-out items are not destinations, whatever they still spell.
  const live = menu.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const items = [...live.matchAll(/<span>([A-Z][^<]*)<\/span>/g)].map((match) => match[1])
  assert.deepEqual(items, ['Chats', 'Projects', 'Media Studio', 'Tools &amp; Kits'])
  // Library stays hidden for v1 — but on both layouts, not just one.
  assert.doesNotMatch(live, /<span>Library<\/span>/)
  assert.doesNotMatch(mobileNav, /Library/)
})

test('the tab bar arrives at the same width where the sidebar becomes a drawer', () => {
  // These were 590px and 820px. Every width between them had no tab bar and no
  // visible sidebar, so tablets in portrait and phones in landscape reached the
  // whole workspace through the menu button alone.
  const navRule = css.lastIndexOf('.mobile-workspace-nav {')
  const mediaBefore = css.slice(0, navRule).lastIndexOf('@media')
  assert.match(css.slice(mediaBefore, mediaBefore + 32), /@media \(max-width: 820px\)/)
  assert.doesNotMatch(page, /matchMedia\('\(max-width: 590px\)'\)/)
  assert.match(page, /matchMedia\('\(max-width: 820px\)'\)/)
})

test('identity is reachable on a touch layout now that the sheet is gone', () => {
  assert.doesNotMatch(css, /\.lab-top-right > \.account-menu,\s*\r?\n\s*\.lab-top-right > \.signed-out-controls/)
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
