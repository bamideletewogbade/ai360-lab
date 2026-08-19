import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS,
  isSettingsSection, settingsPath, settingsSectionTitle,
} from '../src/lib/settings-sections.ts'

test('every settings section is distinct and fully described', () => {
  assert.equal(new Set(SETTINGS_SECTIONS.map((section) => section.id)).size, SETTINGS_SECTIONS.length)
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(section.label.length > 0, `${section.id} needs a label`)
    assert.ok(section.detail.length > 0, `${section.id} needs a detail line`)
    assert.ok(section.title.length > 0, `${section.id} needs a title`)
  }
})

test('the default section is a real section, so /settings always lands somewhere', () => {
  assert.ok(isSettingsSection(DEFAULT_SETTINGS_SECTION))
})

test('only known sections are routable, so an unknown URL cannot render a blank page', () => {
  assert.equal(isSettingsSection('general'), true)
  assert.equal(isSettingsSection('billing'), true)
  assert.equal(isSettingsSection('brand'), true)
  assert.equal(isSettingsSection('account'), true)
  assert.equal(isSettingsSection('passwords'), false)
  assert.equal(isSettingsSection(''), false)
  assert.equal(isSettingsSection(undefined), false)
  assert.equal(isSettingsSection('../admin'), false)
})

test('paths and titles are stable, because they are deep linked and shared with support', () => {
  assert.equal(settingsPath('billing'), '/settings/billing')
  assert.equal(settingsPath('account'), '/settings/account')
  assert.equal(settingsSectionTitle('billing'), 'Credits & Billing')
  assert.equal(settingsSectionTitle('general'), 'General')
})
