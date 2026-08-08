import { BRAND } from '@/lib/brand'

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
        alternateName: BRAND.legacyNames.map((name) => `${name} Lab`),
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
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'GHS',
          description: 'A free monthly allowance is available. Paid plans are listed on the pricing page.',
        },
        provider: [
          { '@id': `${BRAND.companyUrl}/#organization` },
          { '@id': 'https://accrainnovationcenter.com/#organization' },
        ],
        audience: {
          '@type': 'Audience',
          audienceType: 'Students, professionals, entrepreneurs, teams and public servants',
          geographicArea: { '@type': 'AdministrativeArea', name: 'Ghana and Africa' },
        },
        featureList: [
          'Current web research with cited sources',
          'Document and media analysis',
          'Business proposals and practical plans',
          'Campaign strategy and creative production',
          'Human approval before paid production or external action',
        ],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
