import assert from 'node:assert/strict'
import test from 'node:test'
import { FEATURE_WEIGHTS } from '../src/lib/billing/credits.ts'
import {
  findPack, isPackId, PACKS, packConcurrency, packCredits, packSpecialists, SPECIALISTS,
} from '../src/lib/studio/packs.ts'
import {
  checkDomain, domainSuffix, isRdapAuthoritative, normalizeDomain,
} from '../src/lib/studio/domains.ts'

test('Create offers more than one outcome, and each says who it is for', () => {
  assert.ok(PACKS.length >= 5, 'a single hardcoded outcome was the original problem')
  for (const pack of PACKS) {
    assert.ok(pack.outcome.length > 10, `${pack.id} has no outcome`)
    assert.ok(pack.bestFor.length > 5, `${pack.id} does not say who it is for`)
    assert.ok(pack.deliverables.length > 0, `${pack.id} promises nothing`)
    assert.ok(pack.stages.length > 0, `${pack.id} runs nothing`)
  }
  assert.equal(isPackId('naming'), true)
  assert.equal(isPackId('everything'), false)
})

test('every specialist a pack names actually exists', () => {
  for (const pack of PACKS) {
    for (const id of packSpecialists(pack)) {
      assert.ok(SPECIALISTS[id], `${pack.id} references unknown specialist ${id}`)
    }
  }
})

test('no pack can quietly cost more than the priciest thing already quoted', () => {
  for (const pack of PACKS) {
    const credits = packCredits(pack)
    assert.ok(credits > 0, `${pack.id} is free, which is certainly wrong`)
    assert.ok(
      credits <= FEATURE_WEIGHTS.agent.ceiling,
      `${pack.id} costs ${credits}, above the agent ceiling`,
    )
  }
})

test('a smaller pack costs less than the full launch pack', () => {
  // Someone who only needs a name should not pay for a whole brand.
  assert.ok(packCredits(findPack('naming')!) < packCredits(findPack('launch')!))
})

test('only the specialists that need the network are allowed to reach it', () => {
  // Same rule as the agent: capability is granted by the schema, not by asking.
  assert.equal(SPECIALISTS.researcher.usesTools, true)
  assert.equal(SPECIALISTS.domains.usesTools, true)
  assert.equal(SPECIALISTS.copy.usesTools, false)
  assert.equal(SPECIALISTS.brand.usesTools, false)
})

test('packs that assume an existing brand are marked, so they do not ask twice', () => {
  assert.equal(findPack('launch')!.needsBrandFile, false)
  assert.equal(findPack('marketing')!.needsBrandFile, true)
  assert.equal(findPack('naming')!.needsBrandFile, false)
})

test('a pack reports where work genuinely happens at the same time', () => {
  assert.equal(packConcurrency(findPack('marketing')!), 2, 'copy and calendar run together')
  assert.equal(packConcurrency(findPack('naming')!), 1, 'domains must wait for names')
})

test('domain suffixes are read correctly, including Ghanaian second levels', () => {
  assert.equal(domainSuffix('perfdesigns.com'), 'com')
  assert.equal(domainSuffix('mtn.com.gh'), 'com.gh')
  assert.equal(domainSuffix('ug.edu.gh'), 'edu.gh')
  assert.equal(domainSuffix('shop.gh'), 'gh')
})

test('availability is never claimed for a suffix with no registry to ask', () => {
  // rdap.org returns 404 for every .gh name, so trusting it would have told a
  // Ghanaian business that mtn.com.gh was free. Verified live on 2026-08-05.
  assert.equal(isRdapAuthoritative('perfdesigns.com'), true)
  assert.equal(isRdapAuthoritative('mtn.com.gh'), false)
  assert.equal(isRdapAuthoritative('shop.gh'), false)
})

test('messy input is cleaned up or rejected before any lookup happens', () => {
  assert.equal(normalizeDomain('  HTTPS://WWW.PerfDesigns.com/pricing '), 'perfdesigns.com')
  assert.equal(normalizeDomain('perfdesigns'), null)
  assert.equal(normalizeDomain('.com'), null)
  assert.equal(normalizeDomain('a..b.com'), null)
  assert.equal(normalizeDomain('-bad.com'), null)
})

test('a name with live nameservers is reported taken whatever its suffix', async () => {
  const fetcher = (async (url: string) => {
    if (String(url).includes('dns-query')) {
      return { ok: true, json: async () => ({ Status: 0, Answer: [{ data: 'ns1.example.' }] }) }
    }
    throw new Error('RDAP should not be consulted once DNS has proved registration')
  }) as unknown as typeof fetch

  const result = await checkDomain('mtn.com.gh', fetcher)
  assert.equal(result?.verdict, 'taken')
})

test('a Ghanaian name with no DNS is unknown, never available', async () => {
  const fetcher = (async (url: string) => {
    if (String(url).includes('dns-query')) return { ok: true, json: async () => ({ Status: 3 }) }
    return { status: 404, ok: false }
  }) as unknown as typeof fetch

  const result = await checkDomain('brand-new-idea.com.gh', fetcher)
  assert.equal(result?.verdict, 'unknown')
  assert.match(result?.reason ?? '', /registrar/i, 'the person must be told what to do next')
})

test('a gTLD with no registration record is reported available', async () => {
  const fetcher = (async (url: string) => {
    if (String(url).includes('dns-query')) return { ok: true, json: async () => ({ Status: 3 }) }
    return { status: 404, ok: false }
  }) as unknown as typeof fetch

  const result = await checkDomain('brand-new-idea-2026.com', fetcher)
  assert.equal(result?.verdict, 'available')
})

test('a registry that fails to answer is unknown, not available', async () => {
  const fetcher = (async (url: string) => {
    if (String(url).includes('dns-query')) return { ok: true, json: async () => ({ Status: 3 }) }
    return { status: 503, ok: false }
  }) as unknown as typeof fetch

  const result = await checkDomain('something.com', fetcher)
  assert.equal(result?.verdict, 'unknown')
})
