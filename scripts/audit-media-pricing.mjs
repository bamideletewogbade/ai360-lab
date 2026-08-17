import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

/**
 * Does Studio pricing cover its cost and still read as fair?
 *
 * Everything here is measured, not assumed: provider prices come from the live
 * OpenRouter catalogue, realised costs come from `lab_usage_events`, and the
 * credit maths comes from the same module the routes charge with.
 *
 *   node scripts/audit-media-pricing.mjs [envFile]
 */

const envFile = process.argv[2]
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })

const { creditsForUsd, landedCostGhs, usdBudgetForCredits, FEATURE_WEIGHTS, CREDIT_VALUE_GHS, usdToGhs } =
  await import('../src/lib/billing/credits.ts')
const { BILLING_PLANS, CREDIT_TOP_UPS } = await import('../src/lib/billing/catalog.ts')
const { clipPriceUsd, supportsFormat, VIDEO_TIER_PREFERENCES } = await import('../src/lib/media/video-catalogue.ts')

const ghs = (value) => `GH₵${value.toFixed(2)}`
console.log(`Environment: ${envFile}`)
console.log(`Credit cost basis: ${ghs(CREDIT_VALUE_GHS)} landed cost per credit at $1 = ${ghs(usdToGhs())}\n`)

console.log('=== What a credit sells for, by pack ===')
const packs = [
  ...BILLING_PLANS.filter((plan) => plan.monthlyPriceGhs > 0)
    .map((plan) => ({ name: plan.name, price: plan.monthlyPriceGhs, credits: plan.includedCredits })),
  ...CREDIT_TOP_UPS.map((topUp) => ({ name: topUp.slug, price: topUp.priceGhs, credits: topUp.credits })),
]
for (const pack of packs) {
  const perCredit = pack.price / pack.credits
  const margin = (perCredit - CREDIT_VALUE_GHS) / perCredit
  console.log(`  ${pack.name.padEnd(12)} ${ghs(perCredit)}/credit   gross margin ${(margin * 100).toFixed(0)}%   cost at full use ${ghs(pack.credits * CREDIT_VALUE_GHS)} of ${ghs(pack.price)}`)
}
const cheapestPerCredit = Math.min(...packs.map((pack) => pack.price / pack.credits))
const dearestPerCredit = Math.max(...packs.map((pack) => pack.price / pack.credits))

console.log('\n=== Live provider prices for what Studio actually sells ===')
const [videoCatalogue, models] = await Promise.all([
  fetch('https://openrouter.ai/api/v1/videos/models', { signal: AbortSignal.timeout(30_000) })
    .then((response) => response.json()).then((body) => body.data || []),
  fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30_000) })
    .then((response) => response.json()).then((body) => body.data || []),
])

const imageModels = (process.env.OPENROUTER_IMAGE_MODELS || process.env.OPENROUTER_IMAGE_MODEL || '')
  .split(',').map((entry) => entry.trim()).filter(Boolean)
console.log('\n  Image models in rotation:')
for (const id of imageModels) {
  const model = models.find((entry) => entry.id === id)
  const perImage = Number(model?.pricing?.image ?? model?.pricing?.output_image ?? 0)
  if (!model) { console.log(`    ${id.padEnd(38)} not in catalogue`); continue }
  const credits = perImage > 0 ? creditsForUsd(perImage) : null
  console.log(`    ${id.padEnd(38)} $${perImage.toFixed(4)}/image  = ${ghs(landedCostGhs(perImage))} landed  = ${credits ?? '?'} credit(s) of cost`)
}

console.log('\n  Video models per tier (4s 720p 16:9, no audio):')
const format = { durationSeconds: 4, resolution: '720p', aspectRatio: '16:9', withAudio: false }
const videoBudget = usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling)
for (const [tier, ids] of Object.entries(VIDEO_TIER_PREFERENCES)) {
  for (const id of ids) {
    const model = videoCatalogue.find((entry) => entry.id === id)
    if (!model) { console.log(`    ${tier.padEnd(9)} ${id.padEnd(24)} not in catalogue`); continue }
    const usd = supportsFormat(model, format) ? clipPriceUsd(model, format) : null
    if (usd === null) { console.log(`    ${tier.padEnd(9)} ${id.padEnd(24)} cannot be priced/produced in this format`); continue }
    const credits = creditsForUsd(usd)
    const headroom = ((videoBudget - usd) / videoBudget) * 100
    console.log(`    ${tier.padEnd(9)} ${id.padEnd(24)} $${usd.toFixed(4)}  = ${credits} credits of cost  ${usd <= videoBudget ? `${headroom.toFixed(0)}% under the ${FEATURE_WEIGHTS.video.ceiling}-credit ceiling` : 'OVER THE CEILING — unsellable'}`)
  }
}
console.log(`\n  Video ceiling of ${FEATURE_WEIGHTS.video.ceiling} credits buys at most $${videoBudget.toFixed(4)} of provider cost.`)

console.log('\n=== Charged vs cost, per asset ===')
for (const [feature, label] of [['image', 'Generated image'], ['video', '4s video clip']]) {
  const weight = FEATURE_WEIGHTS[feature]
  for (const credits of [weight.floor, weight.reserve, weight.ceiling]) {
    const cost = credits * CREDIT_VALUE_GHS
    console.log(`  ${label.padEnd(16)} ${String(credits).padStart(2)} credits -> costs us ${ghs(cost)}, earns ${ghs(credits * cheapestPerCredit)}–${ghs(credits * dearestPerCredit)} depending on pack`)
  }
}

console.log('\n=== What production has actually spent ===')
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})
try {
  const usage = await sql`
    select feature, count(*) as calls,
           round(avg(actual_cost_usd)::numeric, 5) as avg_usd,
           round(max(actual_cost_usd)::numeric, 5) as max_usd,
           round(sum(actual_cost_usd)::numeric, 4) as total_usd
      from public.lab_usage_events
     where actual_cost_usd is not null and actual_cost_usd > 0
     group by feature order by total_usd desc limit 20`
  if (!usage.length) console.log('  no measured provider costs recorded yet')
  for (const row of usage) {
    const avg = Number(row.avg_usd)
    console.log(`  ${row.feature.padEnd(18)} ${String(row.calls).padStart(4)} calls  avg $${avg.toFixed(5)} (${creditsForUsd(avg)} credits of cost)  max $${Number(row.max_usd).toFixed(5)}  total $${row.total_usd}`)
  }
} finally {
  await sql.end()
}
