import assert from 'node:assert/strict'
import test from 'node:test'
import { clerkUserProfile, webhookEventId } from '../src/lib/clerk-sync.ts'

test('Clerk user synchronization selects the primary email and full display name', () => {
  const profile = clerkUserProfile({
    id: 'user_123',
    primary_email_address_id: 'email_primary',
    email_addresses: [
      { id: 'email_other', email_address: 'other@example.com' },
      { id: 'email_primary', email_address: 'primary@example.com' },
    ],
    first_name: 'Ada',
    last_name: 'Lovelace',
    image_url: 'https://example.com/ada.png',
  })

  assert.deepEqual(profile, {
    id: 'user_123',
    email: 'primary@example.com',
    displayName: 'Ada Lovelace',
    imageUrl: 'https://example.com/ada.png',
  })
})

test('Clerk user synchronization tolerates optional profile fields', () => {
  assert.deepEqual(clerkUserProfile({ id: 'user_123' }), {
    id: 'user_123',
    email: null,
    displayName: null,
    imageUrl: null,
  })
})

test('webhook receipt IDs are bounded and stripped of unsafe characters', () => {
  assert.equal(webhookEventId('msg_123/../../danger'), 'msg_123....danger')
  assert.equal(webhookEventId('!@#$'), null)
  assert.equal(webhookEventId(`msg_${'a'.repeat(200)}`)?.length, 160)
})
