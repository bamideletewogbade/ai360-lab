import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_THEME_CHOICE, isThemeChoice, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY,
} from '../src/lib/theme.ts'

test('light is what applies before anyone has chosen', () => {
  assert.equal(DEFAULT_THEME_CHOICE, 'light')
  assert.equal(resolveTheme(DEFAULT_THEME_CHOICE, true), 'light', 'a dark device must not override the default')
})

test('an explicit choice always wins over the device', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('system follows the device in both directions', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})

test('only the three known choices are accepted', () => {
  for (const value of ['light', 'dark', 'system']) assert.equal(isThemeChoice(value), true)
  for (const value of ['', 'Dark', 'auto', null, undefined, 0]) assert.equal(isThemeChoice(value), false)
})

/**
 * The head script runs before any module loads, so it cannot import the helpers
 * above. These assertions keep the duplicated logic honest.
 */
test('the no-flash head script matches the resolver it duplicates', () => {
  const run = (stored: string | null, systemPrefersDark: boolean) => {
    const root: { dataset: Record<string, string>; style: Record<string, string> } = { dataset: {}, style: {} }
    const sandbox = {
      localStorage: { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) },
      matchMedia: () => ({ matches: systemPrefersDark }),
      document: { documentElement: root },
    }
    new Function('window', 'localStorage', 'document', THEME_INIT_SCRIPT)(
      sandbox, sandbox.localStorage, sandbox.document,
    )
    return root.dataset.theme
  }

  assert.equal(run(null, true), 'light', 'no stored choice stays light even on a dark device')
  assert.equal(run(null, false), 'light')
  assert.equal(run('dark', false), 'dark')
  assert.equal(run('light', true), 'light')
  assert.equal(run('system', true), 'dark')
  assert.equal(run('system', false), 'light')
  assert.equal(run('nonsense', true), 'light', 'a corrupted value falls back to light')
})
