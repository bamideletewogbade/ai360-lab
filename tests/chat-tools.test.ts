import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accumulateToolCalls, CREATE_DOCUMENT_TOOL, guestDocumentSignInMessage, parseToolCall, shouldOfferDocumentTool,
  type StreamedToolCall,
} from '../src/lib/chat-tools.ts'

/** Replays a provider stream the way OpenRouter actually fragments tool calls. */
function replay(chunks: unknown[]) {
  let calls = new Map<number, StreamedToolCall>()
  for (const chunk of chunks) calls = accumulateToolCalls(calls, chunk)
  return [...calls.values()]
}

test('a tool call split across many chunks is reassembled intact', () => {
  const calls = replay([
    [{ index: 0, id: 'call_1', type: 'function', function: { name: 'create_document', arguments: '' } }],
    [{ index: 0, function: { arguments: '{"title":"Price' } }],
    [{ index: 0, function: { arguments: ' list","format":"xls' } }],
    [{ index: 0, function: { arguments: 'x","content":"| A | B |"}' } }],
  ])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].id, 'call_1')
  assert.equal(calls[0].name, 'create_document')
  const parsed = parseToolCall(calls[0])
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.arguments.title, 'Price list')
    assert.equal(parsed.arguments.format, 'xlsx')
  }
})

test('two concurrent tool calls do not bleed into each other', () => {
  const calls = replay([
    [
      { index: 0, id: 'a', function: { name: 'create_document', arguments: '{"title":"One",' } },
      { index: 1, id: 'b', function: { name: 'create_document', arguments: '{"title":"Two",' } },
    ],
    [
      { index: 1, function: { arguments: '"format":"pdf","content":"b"}' } },
      { index: 0, function: { arguments: '"format":"docx","content":"a"}' } },
    ],
  ])
  assert.equal(calls.length, 2)
  const byId = Object.fromEntries(calls.map((c) => [c.id, parseToolCall(c)]))
  assert.equal(byId.a.ok && byId.a.arguments.title, 'One')
  assert.equal(byId.a.ok && byId.a.arguments.format, 'docx')
  assert.equal(byId.b.ok && byId.b.arguments.title, 'Two')
  assert.equal(byId.b.ok && byId.b.arguments.format, 'pdf')
})

test('chunks that are not tool calls are ignored rather than throwing', () => {
  assert.deepEqual(replay([undefined, null, 'nonsense', {}, []]), [])
})

test('a call missing its index still lands in slot zero', () => {
  const calls = replay([[{ id: 'x', function: { name: 'create_document', arguments: '{"title":"T","format":"pdf","content":"c"}' } }]])
  assert.equal(calls.length, 1)
  assert.equal(parseToolCall(calls[0]).ok, true)
})

test('malformed arguments are reported, never thrown', () => {
  const broken = parseToolCall({ index: 0, id: 'c', name: 'create_document', argumentsText: '{"title":' })
  assert.equal(broken.ok, false)
  if (!broken.ok) assert.match(broken.reason, /not valid JSON/)
})

test('an unsupported format is refused with a usable reason', () => {
  const bad = parseToolCall({
    index: 0, id: 'c', name: 'create_document',
    argumentsText: JSON.stringify({ title: 'T', format: 'txt', content: 'x' }),
  })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.reason, /format/)
})

test('an unknown tool name is refused', () => {
  const bad = parseToolCall({ index: 0, id: 'c', name: 'delete_everything', argumentsText: '{}' })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.reason, /Unknown tool/)
})

test('empty content is refused before anything is generated', () => {
  const bad = parseToolCall({
    index: 0, id: 'c', name: 'create_document',
    argumentsText: JSON.stringify({ title: 'T', format: 'pdf', content: '   ' }),
  })
  assert.equal(bad.ok, false)
})

test('the tool is offered only when the person asked for something to keep', () => {
  const asked = (content: string) => shouldOfferDocumentTool([{ role: 'user', content }])
  // Genuine deliverable requests
  assert.equal(asked('Can you make me a price list I can send to spa buyers?'), true)
  assert.equal(asked('Draft a proposal for the Tema account'), true)
  assert.equal(asked('I need a spreadsheet of these figures'), true)
  assert.equal(asked('Can you make a PowerPoint presentation for the board meeting?'), true)
  assert.equal(asked('Put together some slides pitching this to investors'), true)
  // Ordinary conversation must not trigger it
  assert.equal(asked('What is shea butter used for?'), false)
  assert.equal(asked('Explain how wholesale pricing works'), false)
  assert.equal(asked('Thanks, that is helpful'), false)
  // A bare noun without an ask should not be enough
  assert.equal(asked('the report was interesting'), false)
})

test('the tool decision reads the latest request, not the whole history', () => {
  const messages = [
    { role: 'user', content: 'Make me a price list' },
    { role: 'assistant', content: 'Here it is.' },
    { role: 'user', content: 'What does unrefined mean?' },
  ]
  assert.equal(shouldOfferDocumentTool(messages), false)
})

test('a guest file request gets a clear sign-in path instead of a model refusal', () => {
  const messages = [{ role: 'user', content: 'Create an Excel spreadsheet from these figures' }]
  const prompt = guestDocumentSignInMessage({ authConfigured: true, authenticated: false, messages })
  assert.match(prompt ?? '', /sign in to AI360/i)
  assert.match(prompt ?? '', /\/sign-in\?next=%2Fapp/)
  assert.match(prompt ?? '', /send this request again/i)
})

test('the guest sign-in prompt never replaces normal chat or signed-in document generation', () => {
  const documentRequest = [{ role: 'user', content: 'Create a PDF report for me' }]
  assert.equal(guestDocumentSignInMessage({ authConfigured: true, authenticated: true, messages: documentRequest }), null)
  assert.equal(guestDocumentSignInMessage({ authConfigured: false, authenticated: false, messages: documentRequest }), null)
  assert.equal(guestDocumentSignInMessage({
    authConfigured: true, authenticated: false,
    messages: [{ role: 'user', content: 'How do PDFs work?' }],
  }), null)
})

test('the contract the model sees names all four formats and forbids extra fields', () => {
  const fn = CREATE_DOCUMENT_TOOL.function
  assert.equal(fn.name, 'create_document')
  assert.deepEqual(fn.parameters.properties.format.enum, ['pdf', 'docx', 'xlsx', 'pptx'])
  assert.deepEqual(fn.parameters.required, ['title', 'format', 'content'])
  assert.equal(fn.parameters.additionalProperties, false)
})
