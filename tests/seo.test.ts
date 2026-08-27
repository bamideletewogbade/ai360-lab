import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sitemap from '../src/app/sitemap.ts'
import robots from '../src/app/robots.ts'
import { CHANGELOG_RELEASES } from '../src/lib/changelog.ts'
import { BRAND } from '../src/lib/brand.ts'

test('the sitemap reports when the site actually changed, not a date typed once', async () => {
  // It was pinned to 2026-08-08 and stayed there while the product shipped
  // almost daily. A crawler that sees the same `lastmod` every visit learns
  // the site is static and comes back less often.
  const source = await readFile(new URL('../src/app/sitemap.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /new Date\('20\d\d-\d\d-\d\d/, 'no hardcoded literal date')

  const newest = [...CHANGELOG_RELEASES].map((release) => release.date).sort().at(-1)!
  const entries = sitemap()
  const home = entries.find((entry) => entry.url === BRAND.siteUrl)
  assert.ok(home, 'the homepage must be in the sitemap')
  assert.equal(
    new Date(home.lastModified!).toISOString().slice(0, 10),
    newest,
    'lastModified must track the newest changelog release',
  )
})

test('the sitemap lists only pages that may actually be indexed', async () => {
  const entries = sitemap()
  const paths = entries.map((entry) => entry.url.replace(BRAND.siteUrl, '') || '/')

  // Operator surfaces and transactional pages answer `noindex`; advertising
  // them in a sitemap asks a crawler to fetch a page it is then told to ignore.
  for (const forbidden of ['/app', '/admin', '/quality', '/checkout', '/payment/status', '/sign-in', '/sign-up']) {
    assert.ok(!paths.includes(forbidden), `${forbidden} must not be in the sitemap`)
  }
  for (const expected of ['/', '/pricing', '/how-it-works', '/what-you-can-make']) {
    assert.ok(paths.includes(expected), `${expected} should be in the sitemap`)
  }
  assert.ok(entries.every((entry) => entry.url.startsWith('https://')), 'every URL must be absolute and secure')
})

test('answer engines are named individually, because a wildcard does not reach them', () => {
  const rules = robots().rules
  const groups = Array.isArray(rules) ? rules : [rules]
  const agents = groups.flatMap((rule) => {
    const value = rule.userAgent
    return Array.isArray(value) ? value : value ? [value] : []
  })

  // Google-Extended is not Googlebot: it is the separate opt-in governing
  // whether Gemini and AI Overviews may use the site. Being absent from these
  // lists costs a citation, which is worth more here than a ranking.
  for (const agent of ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) {
    assert.ok(agents.includes(agent), `${agent} must be addressed explicitly`)
  }
  assert.ok(agents.includes('*'), 'ordinary crawlers still need a rule')
})

test('robots keeps crawlers out of operator surfaces', () => {
  const rules = robots().rules
  const groups = Array.isArray(rules) ? rules : [rules]
  const wildcard = groups.find((rule) => rule.userAgent === '*')
  assert.ok(wildcard)
  const disallowed = Array.isArray(wildcard.disallow) ? wildcard.disallow : [wildcard.disallow]
  for (const path of ['/api/', '/admin', '/quality', '/sign-in', '/sign-up']) {
    assert.ok(disallowed.includes(path), `${path} must be disallowed`)
  }
  assert.equal(robots().sitemap, `${BRAND.siteUrl}/sitemap.xml`)
})

test('no page repeats the brand name the title template already appends', async () => {
  // The root layout sets `template: '%s | AI360'`, which applies to every child
  // segment. A child that also spells out "| AI360" rendered it twice.
  const suffix = ` | ${BRAND.productName}`
  const pages = [
    'checkout/page.tsx',
    'payment/status/page.tsx',
    'feedback/[reportId]/page.tsx',
    'quality/page.tsx',
    'how-it-works/page.tsx',
    'pricing/page.tsx',
  ]
  for (const page of pages) {
    const source = await readFile(new URL(`../src/app/${page}`, import.meta.url), 'utf8')
    const title = source.match(/title: '([^']+)'/)?.[1]
    if (!title) continue
    assert.ok(!title.endsWith(suffix), `${page} title "${title}" doubles the brand suffix`)
  }
})

test('the answers state facts, not directions to where a fact lives', async () => {
  const { publicAnswers } = await import('../src/lib/answers.ts')
  const { BILLING_PLANS } = await import('../src/lib/billing/catalog.ts')
  const answers = publicAnswers()

  const pricing = answers.find((entry) => /how much/i.test(entry.question))
  assert.ok(pricing, 'the most-asked question must be answered')

  // An answer engine cannot click. "See the pricing page" is a dead end that
  // ends with it naming a competitor who did state a number.
  assert.doesNotMatch(pricing.answer, /see the pricing page|published on the pricing page|visit our/i)

  // Every real plan price must appear, drawn from the catalogue rather than
  // typed out, so the quoted figure cannot drift from the charged one.
  for (const plan of BILLING_PLANS.filter((item) => item.monthlyPriceGhs > 0)) {
    assert.ok(
      pricing.answer.includes(plan.monthlyPriceGhs.toLocaleString('en-GH')),
      `the ${plan.name} price must be stated outright`,
    )
  }

  // The question that decides whether somebody in Ghana tries the product.
  const payment = answers.find((entry) => /mobile money/i.test(entry.question))
  assert.ok(payment && /yes/i.test(payment.answer), 'Mobile Money must be answered plainly')

  // Answers are quotable sentences, not fragments.
  for (const entry of answers) {
    assert.ok(entry.question.endsWith('?'), `"${entry.question}" should be a question`)
    assert.ok(entry.answer.length > 60, `"${entry.question}" needs a real answer`)
    assert.match(entry.answer, /\.$/, `"${entry.question}" should end in a full stop`)
  }
})

test('structured data publishes real prices, not a single free offer', async () => {
  const { planOffers, faqStructuredData } = await import('../src/lib/answers.ts')
  const { BILLING_PLANS } = await import('../src/lib/billing/catalog.ts')

  const offers = planOffers()
  assert.equal(offers['@type'], 'AggregateOffer')
  assert.equal(offers.offerCount, BILLING_PLANS.length)
  assert.equal(offers.priceCurrency, 'GHS')
  // `price: 0` alone previously told every machine the product was free.
  assert.ok(offers.highPrice > 0, 'the paid plans must be visible to a machine')
  assert.equal(offers.lowPrice, 0, 'the free plan should still be represented')

  const faq = faqStructuredData()
  assert.equal(faq['@type'], 'FAQPage')
  assert.ok(faq.mainEntity.length >= 8, 'a thin FAQ is not worth parsing')
  for (const entry of faq.mainEntity) {
    assert.equal(entry['@type'], 'Question')
    assert.equal(entry.acceptedAnswer['@type'], 'Answer')
  }
})
