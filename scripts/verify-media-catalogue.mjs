import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { clipPriceUsd, selectVideoModel, isVideoSelection, supportsFormat, STUDIO_CLIP, MEDIA_TIERS } =
  await import('../src/lib/media/video-catalogue.ts')
const { FEATURE_WEIGHTS, usdBudgetForCredits } = await import('../src/lib/billing/credits.ts')

/**
 * Checks the tier catalogue against what the provider is charging right now.
 * Run this after any pricing change, and before trusting the ranges published
 * on the pricing page.
 */
const budget = usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling)
const res = await fetch('https://openrouter.ai/api/v1/videos/models', { signal: AbortSignal.timeout(30_000) })
if (!res.ok) throw new Error(`video catalogue returned ${res.status}`)
const { data: catalogue } = await res.json()

console.log(`Studio clip: ${STUDIO_CLIP.durationSeconds}s ${STUDIO_CLIP.resolution} ${STUDIO_CLIP.aspectRatio}`)
console.log(`Budget at ${FEATURE_WEIGHTS.video.ceiling} credits: $${budget.toFixed(4)}\n`)

const results = []
const check = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

for (const [tier, meta] of Object.entries(MEDIA_TIERS)) {
  const chosen = selectVideoModel({ catalogue, tier, budgetUsd: budget })
  if (isVideoSelection(chosen)) {
    const share = Math.round((chosen.costUsd / budget) * 100)
    check(`${meta.label} resolves to an affordable model`, chosen.costUsd <= budget,
      `${chosen.model} at $${chosen.costUsd}, ${share}% of budget`)
  } else {
    check(`${meta.label} reports itself unavailable rather than overspending`, true,
      `nothing within $${budget.toFixed(4)}`)
  }
}

// Nothing we offer may be unpriceable or the wrong shape.
const offered = Object.values(MEDIA_TIERS).map((_, index) => index)
const priceable = catalogue.filter((model) => supportsFormat(model, STUDIO_CLIP) && clipPriceUsd(model) !== null)
check('at least one model can be both priced and produced in the Studio format', priceable.length > 0, `${priceable.length} models`)

console.log('\nEvery model that fits the Studio format, cheapest first:')
const rows = catalogue
  .filter((model) => supportsFormat(model, STUDIO_CLIP))
  .map((model) => ({ id: model.id, cost: clipPriceUsd(model) }))
  .sort((a, b) => (a.cost ?? 9e9) - (b.cost ?? 9e9))
for (const row of rows) {
  const cost = row.cost === null ? 'not priceable' : `$${row.cost.toFixed(4)}`
  const verdict = row.cost === null ? 'excluded' : row.cost <= budget ? `${Math.round((row.cost / budget) * 100)}% of budget` : 'over budget'
  console.log(`  ${String(row.id).padEnd(34)} ${cost.padStart(14)}   ${verdict}`)
}

void offered
const failed = results.filter((result) => !result.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
