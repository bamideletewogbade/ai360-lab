import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluatePackSections } from '../src/lib/studio/evaluator.ts'

test('quality gate catches thin output and placeholders before correction spends credits', () => {
  const [evaluation] = evaluatePackSections([{ id: 'copy', title: 'Copywriter', content: 'TODO: insert brand name here.' }])
  assert.equal(evaluation.passed, false)
  assert.ok(evaluation.issues.some((issue) => issue.includes('too short')))
  assert.ok(evaluation.issues.some((issue) => issue.includes('placeholder')))
})

test('current research must carry a descriptive source link', () => {
  const unsupported = evaluatePackSections([{
    id: 'researcher',
    title: 'Researcher',
    content: 'This is a long market finding with enough detail to guide the project, but it repeats general observations without attaching any verifiable source to the claims being made about the market and customer behaviour in Ghana.',
  }])[0]
  assert.equal(unsupported.passed, false)
  assert.ok(unsupported.issues.some((issue) => issue.includes('source link')))

  const supported = evaluatePackSections([{
    id: 'researcher',
    title: 'Researcher',
    content: 'This is a sufficiently detailed market finding grounded in current evidence about how people discover and buy from Ghanaian businesses. The supporting evidence is available from [Ghana Statistical Service](https://statsghana.gov.gh/) and should be applied carefully to this project.',
  }])[0]
  assert.equal(supported.passed, true)
})

