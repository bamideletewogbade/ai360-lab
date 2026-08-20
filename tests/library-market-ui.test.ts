import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/app/app/page.tsx', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/components/StudioWorkspace.tsx', import.meta.url), 'utf8')
const mobileNav = readFileSync(new URL('../src/components/MobileWorkspaceNav.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('Library and Market remain separate destinations on desktop and mobile', () => {
  assert.match(page, /<span>Library<\/span>/)
  assert.match(page, /<span>Market<\/span>/)
  assert.match(mobileNav, /<b>Library<\/b>/)
  assert.match(mobileNav, /<b>Market<\/b>/)
})

test('a Market choice is handed to the real Studio pack launcher', () => {
  assert.match(page, /setMarketPackRequest/)
  assert.match(page, /launchPackId=\{marketPackRequest\.id\}/)
  assert.match(studio, /beginProject\(launchPackId\)/)
})

test('Library and Market have explicit laptop-to-phone layout changes', () => {
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.market-container/)
  assert.match(css, /@media \(max-width: 590px\)[\s\S]*?\.market-grid \{ grid-template-columns: 1fr/)
  assert.match(css, /\.outcomes-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /\.outcomes-filter-bar button \{[\s\S]*?min-height: 44px/)
})

