import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_PLANS } from '../src/lib/billing/catalog.ts'
import { CREDIT_VALUE_GHS, DEFAULT_PROVIDER_FEE_RATE } from '../src/lib/billing/credits.ts'
import { productKnowledgeBlock } from '../src/lib/product-knowledge.ts'

test('the product-knowledge block compiles from live catalog data', () => {
  const block = productKnowledgeBlock()
  assert.ok(block.length > 500, 'the block must carry real product facts, not a stub')
  for (const plan of BILLING_PLANS) {
    assert.ok(block.includes(plan.name), `the block must mention the ${plan.name} plan`)
    assert.ok(block.includes(String(plan.includedCredits)), `the block must state ${plan.name}'s included credits`)
  }
  assert.ok(/Mobile Money/i.test(block), 'the block must mention how people can pay')
  assert.ok(/Accra/.test(block), 'the block must state where AI360 is built')
})

test('the block stays compact enough to be always-on', () => {
  const block = productKnowledgeBlock()
  // ~1,000 characters costs roughly $0.0001 per message on the fast model, so
  // always-on is fine. This test exists to catch the block quietly growing
  // until it dominates every prompt.
  assert.ok(block.length < 3_000, `block is ${block.length} characters; keep it under 3,000`)
})

test('the block never leaks internal economics', () => {
  const block = productKnowledgeBlock()
  assert.ok(!block.includes(String(CREDIT_VALUE_GHS)), 'the internal credit value must never reach the model')
  assert.ok(!block.includes(String(DEFAULT_PROVIDER_FEE_RATE)), 'the provider fee must never reach the model')
  assert.ok(!/\blanded\b/i.test(block), 'internal cost language must never reach the model')
  assert.ok(!/\b25%/.test(block), 'the cost target must never reach the model')
})
