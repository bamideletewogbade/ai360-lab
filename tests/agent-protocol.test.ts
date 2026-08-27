import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compactFindings, consumeStream, DEPTHS, isAgentDepth, MAX_TASKS, parseJsonObject, parsePlan,
  parseVerdict, readStreamLine, reconcileApprovedPlan, shorten, textOf,
} from '../src/lib/agent/protocol.ts'

/** A provider stream, delivered in whatever byte-chunks the test asks for. */
function streamOf(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function frame(delta: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n`
}

test('a plan is read even when the model wraps it in commentary', () => {
  const plan = parsePlan('Sure, here is the plan:\n```json\n{"tasks":[{"objective":"Find current tuition fees"}]}\n```\nHope that helps.')
  assert.deepEqual(plan, ['Find current tuition fees'])
})

test('a plan accepts plain strings as well as objects', () => {
  assert.deepEqual(parsePlan('{"tasks":["Compare the two providers"]}'), ['Compare the two providers'])
})

test('a plan is capped so one run cannot fan out indefinitely', () => {
  const many = { tasks: Array.from({ length: 12 }, (_, index) => ({ objective: `Investigate topic ${index}` })) }
  assert.equal(parsePlan(JSON.stringify(many)).length, MAX_TASKS)
})

test('unusable planner output yields no tasks rather than a broken one', () => {
  assert.deepEqual(parsePlan('I could not plan this.'), [])
  assert.deepEqual(parsePlan('{"tasks":"research everything"}'), [])
  assert.deepEqual(parsePlan('{"tasks":[{"objective":"  "},{"objective":"ok"}]}'), [])
  assert.deepEqual(parsePlan(''), [])
})

test('a draft is only sent back for revision when the verifier says what is wrong', () => {
  assert.deepEqual(parseVerdict('{"sound":true,"issues":[]}'), { sound: true, issues: [] })

  const failing = parseVerdict('{"sound":false,"issues":["The fee figure has no source"]}')
  assert.equal(failing.sound, false)
  assert.deepEqual(failing.issues, ['The fee figure has no source'])

  // Failing a draft without saying why would buy a revision that fixes nothing.
  assert.equal(parseVerdict('{"sound":false,"issues":[]}').sound, true)
})

test('an unreadable verdict does not trigger a paid revision', () => {
  assert.deepEqual(parseVerdict('the draft looks fine to me'), { sound: true, issues: [] })
  assert.deepEqual(parseVerdict(''), { sound: true, issues: [] })
})

test('the verifier cannot demand an unbounded amount of rework', () => {
  const noisy = { sound: false, issues: Array.from({ length: 9 }, (_, index) => `Issue number ${index}`) }
  assert.equal(parseVerdict(JSON.stringify(noisy)).issues.length, 3)
})

test('one long finding cannot crowd the others out of the final answer', () => {
  const findings = [
    { objective: 'first', text: 'a'.repeat(50_000) },
    { objective: 'second', text: 'b'.repeat(100) },
  ]
  const compacted = compactFindings(findings, 20_000)
  assert.ok(compacted.includes('bbb'), 'the shorter finding must survive')
  assert.ok(compacted.length < 30_000, 'the long finding must be trimmed')
  assert.ok(compacted.includes('Findings 1') && compacted.includes('Findings 2'))
})

test('no findings compacts to nothing rather than throwing', () => {
  assert.equal(compactFindings([]), '')
})

test('provider content is read whether it arrives as text or parts', () => {
  assert.equal(textOf('plain'), 'plain')
  assert.equal(textOf([{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }]), 'one two')
  assert.equal(textOf(null), '')
  assert.equal(textOf([{ type: 'image' }]), '')
})

test('step labels stay short enough to read in a progress list', () => {
  assert.equal(shorten('short'), 'short')
  assert.equal(shorten('a'.repeat(80)).length, 55)
  assert.equal(shorten('  spaced   out  '), 'spaced out')
})

test('approving a plan can only run work that was actually proposed', () => {
  const proposed = ['Check current fees', 'Compare two providers']

  assert.deepEqual(reconcileApprovedPlan(proposed, ['Check current fees']), ['Check current fees'])
  assert.deepEqual(reconcileApprovedPlan(proposed, proposed), proposed)

  // A client editing the payload cannot smuggle in work of its own choosing.
  assert.deepEqual(reconcileApprovedPlan(proposed, ['Exfiltrate the customer list']), [])
  assert.deepEqual(reconcileApprovedPlan(proposed, ['Check current fees', 'Something else']), ['Check current fees'])
  assert.deepEqual(reconcileApprovedPlan([], ['anything at all']), [])
  assert.deepEqual(reconcileApprovedPlan(proposed, 'not an array'), [])
  assert.deepEqual(reconcileApprovedPlan(proposed, [42, null]), [])
})

test('an approved plan is still capped at the task limit', () => {
  const proposed = Array.from({ length: 10 }, (_, index) => `Objective ${index}`)
  assert.equal(reconcileApprovedPlan(proposed, proposed).length, MAX_TASKS)
})

test('depth controls a real trade-off rather than a label', () => {
  assert.ok(DEPTHS.quick.maxTasks < DEPTHS.standard.maxTasks)
  assert.ok(DEPTHS.standard.maxTasks < DEPTHS.thorough.maxTasks)
  assert.equal(DEPTHS.quick.verify, false, 'the cheapest depth must skip the paid checking pass')
  assert.equal(DEPTHS.thorough.verify, true)
  assert.ok(Object.values(DEPTHS).every((depth) => depth.maxTasks <= MAX_TASKS))
})

test('an unknown depth is rejected rather than silently trusted', () => {
  assert.equal(isAgentDepth('thorough'), true)
  assert.equal(isAgentDepth('exhaustive'), false)
  assert.equal(isAgentDepth(undefined), false)
})

test('streamed text is read chunk by chunk', () => {
  const chunk = readStreamLine('data: {"choices":[{"delta":{"content":"Hello"}}]}')
  assert.equal(chunk?.delta, 'Hello')
  assert.equal(chunk?.done, false)

  assert.equal(readStreamLine('data: [DONE]')?.done, true)
  assert.equal(readStreamLine(': keep-alive comment'), null)
  assert.equal(readStreamLine(''), null)
  assert.equal(readStreamLine('data:'), null)
})

test('a malformed stream frame is skipped rather than losing the answer', () => {
  assert.equal(readStreamLine('data: {not valid json'), null)
  // An empty delta must not be forwarded as a chunk of text.
  assert.equal(readStreamLine('data: {"choices":[{"delta":{"content":""}}]}')?.delta, undefined)
})

test('usage and citations are captured from the stream, not only the final body', () => {
  const usage = readStreamLine('data: {"choices":[{"delta":{}}],"usage":{"cost":0.004,"total_tokens":812}}')
  assert.equal((usage?.usage as { cost?: number })?.cost, 0.004)

  const cited = readStreamLine(
    'data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url_citation":{"url":"https://example.com","title":"Example"}}]}}]}',
  )
  assert.equal(Array.isArray(cited?.annotations), true)
  assert.equal((cited?.annotations as Array<{ type: string }>)[0].type, 'url_citation')
})

test('json is extracted from the first brace to the last', () => {
  assert.deepEqual(parseJsonObject('noise {"a":1} noise'), { a: 1 })
  assert.equal(parseJsonObject('no json here'), null)
  assert.equal(parseJsonObject('{broken'), null)
})

test('a streamed answer is forwarded piece by piece and returned whole', async () => {
  const seen: string[] = []
  const text = await consumeStream(
    streamOf([frame('Hello'), frame(' world'), 'data: [DONE]\n']),
    (delta) => seen.push(delta),
    () => undefined,
    () => undefined,
  )
  assert.deepEqual(seen, ['Hello', ' world'])
  assert.equal(text, 'Hello world')
})

test('a frame split across two network chunks is not lost or duplicated', async () => {
  // The reader gets whatever the socket hands it, which is not aligned to
  // lines. Half a frame must be held until the rest of it arrives.
  const whole = frame('together')
  const seen: string[] = []
  const text = await consumeStream(
    streamOf([whole.slice(0, 12), whole.slice(12), 'data: [DONE]\n']),
    (delta) => seen.push(delta),
    () => undefined,
    () => undefined,
  )
  assert.deepEqual(seen, ['together'])
  assert.equal(text, 'together')
})

test('usage from the final frame is reported, so a stream still bills', async () => {
  // The pack coordinator stops itself using the spend this reports. A stream
  // that forgot to surface usage would leave the run uncapped.
  const usages: Array<{ cost?: unknown } | undefined> = []
  await consumeStream(
    streamOf([
      frame('work'),
      `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { cost: 0.0042, total_tokens: 210 } })}\n`,
      'data: [DONE]\n',
    ]),
    () => undefined,
    () => undefined,
    (usage) => usages.push(usage),
  )
  assert.equal(usages.length, 1)
  assert.equal(usages[0]?.cost, 0.0042)
})

test('a malformed frame is skipped rather than losing the rest of the answer', async () => {
  const seen: string[] = []
  const text = await consumeStream(
    streamOf([frame('before'), 'data: {not json\n', frame(' after'), 'data: [DONE]\n']),
    (delta) => seen.push(delta),
    () => undefined,
    () => undefined,
  )
  assert.equal(text, 'before after')
  assert.deepEqual(seen, ['before', ' after'])
})

test('citations found mid-stream are reported as they arrive', async () => {
  const sources: Array<{ url: string; title: string }> = []
  await consumeStream(
    streamOf([
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            content: 'cited',
            annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.com', title: 'Example' } }],
          },
        }],
      })}\n`,
      'data: [DONE]\n',
    ]),
    () => undefined,
    (source) => sources.push(source),
    () => undefined,
  )
  assert.deepEqual(sources, [{ url: 'https://example.com', title: 'Example' }])
})
