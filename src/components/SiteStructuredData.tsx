import { BRAND } from '@/lib/brand'
import { faqStructuredData, planOffers } from '@/lib/answers'

export function SiteStructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${BRAND.companyUrl}/#organization`,
        name: BRAND.name,
        alternateName: BRAND.legacyNames,
        url: BRAND.companyUrl,
        logo: `${BRAND.siteUrl}/logo-black.png`,
        description: BRAND.mission,
        foundingLocation: {
          '@type': 'Place',
          name: 'Accra, Ghana',
        },
        location: {
          '@type': 'Place',
          name: 'AIC House',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Kofi Anum Tesa Street, Adjirigano, East Legon',
            addressLocality: 'Accra',
            addressRegion: 'Greater Accra',
            addressCountry: 'GH',
          },
          identifier: 'GD-253-5017',
        },
        areaServed: ['Ghana', 'Africa'],
      },
      {
        '@type': 'Organization',
        '@id': 'https://accrainnovationcenter.com/#organization',
        name: 'Accra Innovation Centre',
        url: 'https://accrainnovationcenter.com/',
        telephone: '+233256120157',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'AIC House, Kofi Anum Tesa Street, Adjirigano, East Legon',
          addressLocality: 'Accra',
          addressRegion: 'Greater Accra',
          addressCountry: 'GH',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${BRAND.siteUrl}/#website`,
        url: BRAND.siteUrl,
        name: BRAND.productName,
        // Former names, so a search for what the product used to be called
        // still resolves to it.
        alternateName: [...BRAND.legacyNames],
        description: BRAND.signature,
        inLanguage: 'en',
        publisher: { '@id': `${BRAND.companyUrl}/#organization` },
      },
      {
        '@type': 'WebApplication',
        '@id': `${BRAND.siteUrl}/#application`,
        name: BRAND.productName,
        url: BRAND.siteUrl,
        description: 'A practical AI workspace for research, learning, planning, proposals, campaigns and creative production.',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser',
        isAccessibleForFree: true,
        // Real prices, generated from the billing catalogue. This was a single
        // `price: 0`, which to a machine reads as "the product is free" — so an
        // answer engine asked what AI360 costs would have said so, confidently
        // and wrongly.
        offers: planOffers(),
        provider: [
          { '@id': `${BRAND.companyUrl}/#organization` },
          { '@id': 'https://accrainnovationcenter.com/#organization' },
        ],
        audience: {
          '@type': 'Audience',
          audienceType: 'Students, professionals, entrepreneurs, teams and public servants',
          geographicArea: { '@type': 'AdministrativeArea', name: 'Ghana and Africa' },
        },
        // Naming the exact currency and rails is deliberate: "does it take
        // Mobile Money" is the question that decides whether somebody in Ghana
        // tries the product at all, and it should be answerable without a
        // single click.
        paymentAccepted: 'Mobile Money, Visa, Mastercard',
        currenciesAccepted: 'GHS',
        featureList: [
          'Current web research with cited sources',
          'Document and media analysis',
          'Business proposals and practical plans',
          'Campaign strategy and creative production',
          'Human approval before paid production or external action',
        ],
      },
      // The shape answer engines read most directly. Every entry states its
      // fact outright rather than pointing at the page that holds it.
      faqStructuredData(),
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
