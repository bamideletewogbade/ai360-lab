import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { defaultMediaIntent, mediaIntentSchema, mediaIntentSummary } from '@/lib/media/intent'

test('media defaults follow the project channel without exposing a provider', () => {
  const intent = defaultMediaIntent({
    mediaType: 'video',
    purpose: 'Launch the new drink',
    projectChannels: ['WhatsApp', 'Instagram'],
  })
  assert.equal(intent.channel, 'whatsapp_status')
  assert.equal(intent.aspectRatio, '9:16')
  assert.equal(intent.durationSeconds, 4)
  assert.equal(intent.qualityTier, 'standard')
  assert.doesNotMatch(JSON.stringify(intent), /openai|google|veo|seedance/i)
})

test('image and video constraints cannot be mixed accidentally', () => {
  const invalid = mediaIntentSchema.safeParse({
    mediaType: 'image', purpose: 'A flyer', channel: 'print', aspectRatio: '2:3',
    resolution: '720p', durationSeconds: 4, audio: 'ambient',
  })
  assert.equal(invalid.success, false)
})

test('the summary uses customer language', () => {
  const intent = defaultMediaIntent({ mediaType: 'image', purpose: 'Product post', projectChannels: ['Instagram'] })
  assert.equal(mediaIntentSummary(intent), '1:1 1K image for Instagram post')
})

test('the media migration isolates workspaces and indexes active jobs', async () => {
  const migration = await readFile(new URL('../database/postgres/0011_media_generation.sql', import.meta.url), 'utf8')
  for (const table of ['lab_media_jobs', 'lab_media_outputs']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /where status in \('queued', 'submitted', 'running'\)/)
  assert.match(migration, /revoke all on public\.lab_media_jobs, public\.lab_media_outputs from anon, authenticated/)
})
