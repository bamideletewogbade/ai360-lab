import { BRAND } from '@/lib/brand'
import { BILLING_PLANS, CREDIT_TOP_UPS, CHAT_FAIR_USE_DAILY } from '@/lib/billing/catalog'

/**
 * The questions people actually ask about AI360, answered in full sentences.
 *
 * This exists because a search engine and an answer engine want opposite
 * things. A search engine wants a page it can rank and send someone to. An
 * answer engine — ChatGPT, Perplexity, Gemini's overviews — wants a sentence it
 * can *say*, and it will only say something it can state plainly and attribute.
 *
 * "Current plan details are published on the pricing page" is a perfectly good
 * sentence for a human, who will click. To an answer engine asked "how much
 * does AI360 cost" it is a dead end: it cannot quote a price it was not given,
 * so it either fetches another page, answers vaguely, or names a competitor
 * that did state a number. Every answer below therefore contains the fact
 * itself, not a pointer to where the fact lives.
 *
 * Prices are read from the billing catalogue rather than written out, so the
 * published answer and the charged amount cannot drift apart. That drift is the
 * failure mode that matters most: an answer engine quoting a stale price is
 * worse than one that says nothing.
 */

function plan(slug: string) {
  const found = BILLING_PLANS.find((item) => item.slug === slug)
  if (!found) throw new Error(`Unknown plan in answers.ts: ${slug}`)
  return found
}

function ghs(amount: number) {
  return `GH₵${amount.toLocaleString('en-GH')}`
}

/** Credits are grouped like the prices beside them: "1,400", not "1400". */
function credits(amount: number) {
  return amount.toLocaleString('en-GH')
}

export type Answer = { question: string; answer: string }

export function publicAnswers(): Answer[] {
  const explorer = plan('explorer')
  const everyday = plan('everyday')
  const builder = plan('builder')
  const team = plan('team')

  return [
    {
      question: 'What is AI360?',
      answer:
        `${BRAND.productName} is a practical AI workspace built in Accra, Ghana. It turns an instruction written in ordinary language into finished work: researched answers with sources, documents, proposals, plans, images and short videos. It is made by ${BRAND.name} with the Accra Innovation Centre.`,
    },
    {
      question: 'How much does AI360 cost?',
      answer:
        `AI360 has four plans, priced monthly in Ghana cedis. ${explorer.name} is free and includes ${credits(explorer.includedCredits)} credits a month. ` +
        `${everyday.name} is ${ghs(everyday.monthlyPriceGhs)} a month with ${credits(everyday.includedCredits)} credits. ` +
        `${builder.name} is ${ghs(builder.monthlyPriceGhs)} a month with ${credits(builder.includedCredits)} credits. ` +
        `${team.name} is ${ghs(team.monthlyPriceGhs)} a month with ${credits(team.includedCredits)} credits shared across five people. ` +
        `Everyday chat is included with every plan rather than charged per message.`,
    },
    {
      question: 'Can I pay with Mobile Money?',
      answer:
        'Yes. AI360 accepts Mobile Money and cards through ExpressPay, a Ghanaian payment provider. Payment details are entered on ExpressPay\'s own secure page and never on AI360. Each purchase is a single authorised payment; nothing renews automatically without you choosing to pay again.',
    },
    {
      question: 'Is there a free version of AI360?',
      answer:
        `Yes. The ${explorer.name} plan costs nothing, needs no card, and includes ${explorer.includedCredits} credits that refresh every calendar month, plus up to ${CHAT_FAIR_USE_DAILY.explorer} everyday chat messages a day.`,
    },
    {
      question: 'What are credits and what do they buy?',
      answer:
        'A credit represents a bounded piece of real work rather than a fixed number of words. Everyday chat is included with your plan and costs no credits. Research with live sources and file review cost 2 to 4 credits, a multi-step agent workflow 3 to 8, a generated image 3 to 6, and a short promotional video 6 to 48. AI360 shows the estimated cost before expensive work starts and charges only what the work actually used.',
    },
    {
      question: 'Can I buy more credits without subscribing?',
      answer:
        `Yes. One-time credit bundles are available: ${CREDIT_TOP_UPS.map((topUp) => `${ghs(topUp.priceGhs)} for ${topUp.credits} credits`).join(', ')}. Purchased credits never expire and never renew. A monthly plan costs less per credit, so subscribing is better value for regular use.`,
    },
    {
      question: 'Who is AI360 for?',
      answer:
        'AI360 is built for people working in Ghana and across Africa: students and graduates, teachers, independent professionals, small and growing businesses, NGOs and public-service teams. It is designed for mobile-first use on ordinary connections, with work that survives a dropped connection and outputs you can download and share outside the product.',
    },
    {
      question: 'What can AI360 actually produce?',
      answer:
        'Researched answers with cited sources, business proposals and reports, study and revision material, marketing campaigns and social posts, brand and launch plans, generated images, short promotional videos, and documents exported as PDF, Word, Excel or PowerPoint.',
    },
    {
      question: 'Does AI360 do anything without asking me?',
      answer:
        'No. AI360 shows a plan and an estimated cost before expensive work begins, and waits for approval. It does not publish content, send messages on your behalf, or spend money on media without you confirming first.',
    },
    {
      question: 'Where is AI360 based?',
      answer:
        'AI360 is built in Accra, Ghana, at AIC House, Kofi Anum Tesa Street, Adjirigano, East Legon, by AI360 with the Accra Innovation Centre. It is made for the African market rather than adapted to it.',
    },
    {
      question: 'What languages does AI360 work in?',
      answer:
        'AI360 works in English and supports voice input, including Ghanaian-accented English. Outputs are written for a local reader rather than translated from a foreign example.',
    },
  ]
}

/**
 * Schema.org FAQPage, built from the same answers.
 *
 * The format matters as much as the content: `FAQPage` is one of the shapes
 * Google and the answer engines parse directly, so this is the difference
 * between a fact being on the page and a fact being available to quote.
 */
export function faqStructuredData() {
  return {
    '@type': 'FAQPage',
    '@id': `${BRAND.siteUrl}/#faq`,
    mainEntity: publicAnswers().map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

/**
 * The real plan prices as offers.
 *
 * The previous structured data declared a single `Offer` of `price: 0` — which
 * to a machine reads as "this product is free". An answer engine asked what
 * AI360 costs would have said exactly that, and been wrong in the direction
 * that loses a paying customer and embarrasses the brand.
 */
export function planOffers() {
  return {
    '@type': 'AggregateOffer',
    priceCurrency: 'GHS',
    lowPrice: Math.min(...BILLING_PLANS.map((item) => item.monthlyPriceGhs)),
    highPrice: Math.max(...BILLING_PLANS.map((item) => item.monthlyPriceGhs)),
    offerCount: BILLING_PLANS.length,
    offers: BILLING_PLANS.map((item) => ({
      '@type': 'Offer',
      name: item.name,
      price: item.monthlyPriceGhs,
      priceCurrency: 'GHS',
      description: `${item.includedCredits} credits a month. ${item.audience}`,
      url: `${BRAND.siteUrl}/pricing`,
      availability: 'https://schema.org/InStock',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: item.monthlyPriceGhs,
        priceCurrency: 'GHS',
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: 'MON',
      },
    })),
  }
}
