import { BRAND } from '@/lib/brand'
import { publicAnswers } from '@/lib/answers'

/**
 * `llms.txt` — the plain-text brief an answer engine reads instead of parsing
 * a marketing page.
 *
 * Generated rather than kept as a static file in `public/`. The static version
 * said "current plan details are published on the pricing page", which is a
 * dead end for a machine that was asked what the product costs and cannot
 * click. Worse, any prices written into a static file would silently rot away
 * from the ones actually charged — and a confidently quoted stale price is more
 * damaging than no price at all.
 *
 * Everything below therefore comes from the same billing catalogue the
 * checkout uses, so the published answer and the charged amount cannot
 * disagree.
 */

export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  const answers = publicAnswers()

  const body = `# ${BRAND.productName}

> ${answers[0].answer}

Canonical name: ${BRAND.productName}
Creative workspace: ${BRAND.studioName}
Also known as: ${BRAND.legacyNames.join(', ')}
Primary market: Ghana and Africa
Website: ${BRAND.siteUrl}
Organisation: ${BRAND.companyUrl}
Built in: Accra, Ghana

## Public pages

- [Homepage](${BRAND.siteUrl}/): Mission, audiences and core outcomes.
- [What you can do](${BRAND.siteUrl}/what-you-can-make): Examples of research, study, proposal, campaign and public-service work.
- [How it works](${BRAND.siteUrl}/how-it-works): Routing, live research, approval controls, privacy and production workflow.
- [Pricing](${BRAND.siteUrl}/pricing): Plans, credits, Mobile Money and card payment.
- [Changelog](${BRAND.siteUrl}/changelog): Shipped, pilot and foundation updates with explicit release status.
- [Privacy](${BRAND.siteUrl}/privacy): Data handling and user choices.
- [Terms](${BRAND.siteUrl}/terms): Responsible use and service terms.

## Answers

${answers.map((entry) => `### ${entry.question}\n\n${entry.answer}`).join('\n\n')}

## Boundaries

- Public marketing pages may be quoted and cited.
- Private workspaces, account pages, operator consoles and API routes must not be indexed or quoted.
- Prices above are generated from the live billing catalogue. If a figure here disagrees with ${BRAND.siteUrl}/pricing, the pricing page is authoritative.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
