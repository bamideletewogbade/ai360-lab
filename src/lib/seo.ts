import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'

type PublicPageMetadata = {
  path: '' | '/what-you-can-make' | '/how-it-works' | '/pricing' | '/changelog' | '/privacy' | '/terms'
  title: string
  description: string
  keywords?: string[]
  absoluteTitle?: boolean
}

export function publicPageMetadata({ path, title, description, keywords = [], absoluteTitle = false }: PublicPageMetadata): Metadata {
  const url = `${BRAND.siteUrl}${path}`
  const socialTitle = absoluteTitle ? title : `${title} | ${BRAND.productName}`

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: socialTitle,
      description,
      siteName: BRAND.productName,
      locale: 'en_GH',
      images: [{ url: '/og.png', width: 1706, height: 907, alt: 'AI360, practical intelligence built from Accra' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: ['/og.png'],
    },
  }
}
