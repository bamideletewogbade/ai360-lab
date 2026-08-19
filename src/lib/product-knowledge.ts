import { BRAND } from '@/lib/brand'
import { BILLING_PLANS, CHAT_FAIR_USE_DAILY, CREDIT_TOP_UPS } from '@/lib/billing/catalog'
import { ghanaianLanguages } from '@/lib/languages'

/**
 * What AI360 knows about itself.
 *
 * The base system prompt used to tell the model only that it is AI360. It could
 * not answer "what can you do?", "how much is Builder?" or "do you accept
 * Mobile Money?" without guessing. This block is the always-on, public-facts
 * answer to that, appended to the chat and agent system prompts.
 *
 * Rules that keep it safe:
 * - Public facts only. Nothing here may reference internal constants such as
 *   `CREDIT_VALUE_GHS`, margins, foreign-exchange rates or provider strategy.
 *   `tests/product-knowledge.test.ts` guards against that.
 * - It states honest limits rather than overpromising, and instructs the model
 *   not to invent policies (renewal, refunds, limits) that are not written
 *   here.
 * - It stays compact: at ~1,000 characters the input cost is negligible
 *   (roughly $0.0001 per message on the fast model), so always-on beats a
 *   retrieval step at pilot scale. Revisit RAG over the help pages only when
 *   questions outgrow this block.
 */

export function productKnowledgeBlock() {
  const plans = BILLING_PLANS.map((plan) => {
    const price = plan.monthlyPriceGhs === 0 ? 'free' : `GH₵${plan.monthlyPriceGhs}/month`
    const people = plan.workspace === 'organization' ? ' for five people' : ''
    return `${plan.name}: ${price}, ${plan.includedCredits} work credits a month${people}`
  }).join('; ')
  const languages = ghanaianLanguages().map((language) => language.nativeName).join(', ')
  // Derived, never typed: this block is what the assistant tells customers about
  // price and limits, so a stale copy here is the product lying to them.
  const dailyLimits = BILLING_PLANS.map((plan) => `${plan.name} ${CHAT_FAIR_USE_DAILY[plan.slug]}`).join(', ')
  const topUps = CREDIT_TOP_UPS.map((topUp) => topUp.credits)

  return [
    `ABOUT AI360 — product facts, not guesses:`,
    `- ${BRAND.name} is a practical AI workspace built in Accra, Ghana (an initiative of the Accra Innovation Center) for learners, professionals, small businesses, NGOs and public-service teams across Africa.`,
    `- Everyday chat on the fast model is included with a plan up to a fair daily limit (${dailyLimits} messages, resetting at midnight UTC); extra chat messages cost 1 credit each. Live web research, attached files, deliberately premium models (Claude Sonnet 5, Kimi K3), multi-step agent workflows, images and video draw from a credit balance. Work holds credits only while it runs; failed work returns them; no task costs more than the amount shown before it starts.`,
    `- Plans: ${plans}.`,
    `- Payment is by Mobile Money (MTN MoMo, Telecel Cash, AT Money) or card, one month at a time. There are no annual plans yet, and nothing renews without the person starting a fresh payment. One-time top-ups of ${topUps.slice(0, -1).join(', ')} or ${topUps.at(-1)} credits are available from the credit page; they cost more per credit than a plan and never renew.`,
    `- What it can do: everyday chat, live web search with cited sources, reading attached files and PDFs, multi-step research agents, Studio packs (brand and launch, marketing, ads, name and domain, pitch, content calendar), image generation, short promotional video with a quote shown before it runs, document export (PDF, Word, Excel and PowerPoint), and replies in English, ${languages}.`,
    `- Generated documents can carry a person's own colours: a primary and accent colour saved once in Settings > Brand apply automatically to every document from then on, no extra step per document. A project's own brand colours (set while building it in Projects) take precedence over the saved workspace default for that project's documents.`,
    `- Honest limits: voice input currently understands English only; domain availability for .gh names can only ever be reported as taken or unknown, never confirmed free; image and video are never generated until the person approves.`,
    `- When asked about features, plans, pricing, credits, payment or anything about ${BRAND.name}, answer from this block, then point to ${BRAND.siteUrl}/pricing, ${BRAND.siteUrl}/how-it-works and ${BRAND.siteUrl}/what-you-can-make for the full picture. Never invent a policy (renewal, refunds, limits, availability) that is not stated here; say the team will confirm instead.`,
  ].join('\n')
}
