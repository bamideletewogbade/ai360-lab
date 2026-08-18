import assert from 'node:assert/strict'
import test from 'node:test'
import { findPack } from '../src/lib/studio/packs.ts'
import { addAssetVersion, createPackProject, initialProjectSpecialists, packProjectAssets } from '../src/lib/studio-project-model.ts'

const intake = {
  businessName: 'Sankofa Harvest',
  industry: 'Drinks',
  offer: 'Bottled hibiscus and ginger drink',
  audience: 'Busy office workers in Accra',
  goal: 'Launch the drink and win the first 100 customers',
  location: 'Accra, Ghana',
  channels: ['WhatsApp', 'Instagram'],
  notes: '',
}

test('specialist sections become reviewable versioned deliverables', () => {
  const assets = packProjectAssets([
    { id: 'researcher', title: 'Researcher', content: 'Current market evidence' },
    { id: 'campaign', title: 'Campaign', content: 'Campaign direction' },
  ], 100)

  assert.equal(assets.length, 2)
  assert.equal(assets[0].title, 'Research findings')
  assert.equal(assets[1].title, 'Campaign plan')
  assert.equal(assets[0].version, 1)
  assert.equal(assets[0].versions?.[0].reason, 'created')
  assert.equal(assets[0].status, 'draft')
})

test('a pack result becomes one durable project with its original promise attached', () => {
  const pack = findPack('marketing')!
  const specialists = initialProjectSpecialists(pack).map((specialist) => ({ ...specialist, status: 'complete' as const }))
  const project = createPackProject({
    id: 'project-1',
    intake,
    pack,
    sections: [{ id: 'campaign', title: 'Campaign', content: 'The plan' }],
    sources: [{ title: 'GSS', url: 'https://statsghana.gov.gh/' }],
    specialists,
    startedAt: 100,
    completedAt: 200,
  })

  assert.equal(project.schemaVersion, 2)
  assert.equal(project.pack?.id, 'marketing')
  assert.deepEqual(project.pack?.promisedDeliverables, pack.deliverables)
  assert.equal(project.run?.status, 'complete')
  assert.equal(project.assets[0].specialistId, 'campaign')
})

test('an improved deliverable keeps the prior version', () => {
  const [asset] = packProjectAssets([{ id: 'copy', title: 'Copy', content: 'First draft' }], 100)
  const improved = addAssetVersion(asset, 'Second draft', 'ai_revision', 200)

  assert.equal(improved.version, 2)
  assert.equal(improved.content, 'Second draft')
  assert.deepEqual(improved.versions?.map((version) => version.content), ['First draft', 'Second draft'])
})
