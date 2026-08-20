import assert from 'node:assert/strict'
import test from 'node:test'
import { filterMarketProducts, MARKET_PRODUCTS, type MarketCategory } from '../src/lib/market-catalog.ts'
import { findPack } from '../src/lib/studio/packs.ts'

test('every Tools and Kits listing launches a real working Project pack', () => {
  assert.ok(MARKET_PRODUCTS.length >= 15, 'the catalogue should cover several audiences and useful jobs')
  for (const product of MARKET_PRODUCTS) {
    const pack = findPack(product.packId)
    assert.ok(pack, `${product.id} points to a pack that does not exist`)
    assert.ok(pack.deliverables.length > 0, `${product.id} cannot say what it produces`)
  }
})

test('Tools and Kits listing ids are stable and unique', () => {
  assert.equal(new Set(MARKET_PRODUCTS.map((product) => product.id)).size, MARKET_PRODUCTS.length)
})

test('the catalogue serves study, career, creative, business and decision needs', () => {
  const categories = new Set(MARKET_PRODUCTS.map((product) => product.category))
  for (const category of ['study', 'career', 'create', 'business', 'decide']) {
    assert.ok(categories.has(category as MarketCategory), `${category} has no useful option`)
  }
})

test('catalogue search finds user language and tags, then combines with categories', () => {
  assert.deepEqual(filterMarketProducts(MARKET_PRODUCTS, 'all', 'domain').map((product) => product.id), ['name-domain'])
  assert.ok(filterMarketProducts(MARKET_PRODUCTS, 'all', 'WhatsApp').some((product) => product.id === 'business-starter'))
  assert.equal(filterMarketProducts(MARKET_PRODUCTS, 'decide', 'ads').length, 0)
  assert.ok(filterMarketProducts(MARKET_PRODUCTS, 'all', 'new grad').some((product) => product.id === 'cv-job-application'))
  assert.ok(filterMarketProducts(MARKET_PRODUCTS, 'study', 'final year').some((product) => product.id === 'final-year-project'))
})

test('searchable language exists beyond internal pack names', () => {
  for (const product of MARKET_PRODUCTS) {
    assert.ok(product.promise.length > 15, `${product.id} needs a plain-language promise`)
    assert.ok(product.description.length > 30, `${product.id} needs enough context to choose well`)
    assert.ok(product.tags.length >= 3, `${product.id} will be too difficult to find`)
    assert.ok(product.starterPrompt.length > 40, `${product.id} needs useful kickoff context`)
  }
})
