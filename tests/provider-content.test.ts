import assert from 'node:assert/strict'
import test from 'node:test'
import {
  looksLikeLeakedReasoning,
  providerContentText,
  servedModel,
  stripThinkingBlocks,
  wasTruncated,
} from '../src/lib/provider-content.ts'

test('plain string content is passed through untouched', () => {
  assert.equal(providerContentText('Hello Leo'), 'Hello Leo')
  assert.equal(providerContentText(''), '')
})

test('structured content parts become readable text instead of raw JSON', () => {
  // The exact shape that reached a real user as visible JSON.
  const part = { type: 'text', text: 'Hello Leo! It is great to meet you.' }
  assert.equal(providerContentText(part), 'Hello Leo! It is great to meet you.')
  assert.equal(providerContentText([part]), 'Hello Leo! It is great to meet you.')
})

test('multi-part content is joined in order', () => {
  assert.equal(
    providerContentText([
      { type: 'text', text: 'Start with ' },
      { type: 'text', text: 'the answer.' },
    ]),
    'Start with the answer.',
  )
})

test('a reasoning part is never shown to the person who asked', () => {
  assert.equal(
    providerContentText([
      { type: 'thinking', text: 'The user is Leo, so I should first consider...' },
      { type: 'text', text: 'Welcome, Leo.' },
    ]),
    'Welcome, Leo.',
  )
})

test('unusable content shapes yield empty text rather than object noise', () => {
  for (const value of [null, undefined, 42, true, {}, { type: 'text' }, [null, 7]]) {
    const result = providerContentText(value)
    assert.equal(typeof result, 'string')
    assert.ok(!result.includes('object Object'), `leaked object for ${JSON.stringify(value)}`)
  }
})

test('a complete thinking block is removed and the answer survives', () => {
  assert.equal(
    stripThinkingBlocks('<think>Plan the reply carefully.</think>Welcome, Leo.'),
    'Welcome, Leo.',
  )
  assert.equal(
    stripThinkingBlocks('<thinking>Step one.</thinking>\n\nThe answer.'),
    'The answer.',
  )
})

test('an unclosed thinking tag is left alone so streaming text is not destroyed', () => {
  const partial = '<think>I am still reasoning and the tag has not closed'
  assert.equal(stripThinkingBlocks(partial), partial)
})

test('text without any thinking block is returned unchanged', () => {
  const answer = 'Mobile Money is used for sending and receiving money.'
  assert.equal(stripThinkingBlocks(answer), answer)
})

test('leaked planning notes are recognised', () => {
  assert.ok(looksLikeLeakedReasoning('Thinking Process:\n\n1. Analyze the user'))
  assert.ok(looksLikeLeakedReasoning('<think>the user wants'))
  assert.ok(looksLikeLeakedReasoning('Okay, so the user is asking about tech'))
})

test('a normal answer is not mistaken for leaked reasoning', () => {
  assert.ok(!looksLikeLeakedReasoning('## Welcome, Leo\n\nYou do not need a technical background.'))
  assert.ok(!looksLikeLeakedReasoning('Hello Leo! Welcome to the world of tech.'))
  assert.ok(!looksLikeLeakedReasoning('Thinking about your budget is a good first step.'))
})

test('a response cut off by the token budget is detectable', () => {
  assert.ok(wasTruncated('length'))
  assert.ok(!wasTruncated('stop'))
  assert.ok(!wasTruncated(undefined))
})

test('the model that served the call is recorded, not the one requested', () => {
  assert.equal(servedModel({ model: 'qwen/qwen3.7-plus' }, 'openai/gpt-5.6-luna'), 'qwen/qwen3.7-plus')
})

test('the requested model stands in when the provider names none', () => {
  assert.equal(servedModel({}, 'openai/gpt-5.6-luna'), 'openai/gpt-5.6-luna')
  assert.equal(servedModel({ model: '  ' }, 'openai/gpt-5.6-luna'), 'openai/gpt-5.6-luna')
})
