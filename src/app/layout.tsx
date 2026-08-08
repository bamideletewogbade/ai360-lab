import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google'
import './globals.css'
import './landing.css'
import { AuthProvider } from '@/components/AuthProvider'
import { SiteStructuredData } from '@/components/SiteStructuredData'
import { BRAND } from '@/lib/brand'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: {
    default: BRAND.productName,
    template: `%s | ${BRAND.productName}`,
  },
  description: 'A practical AI workspace from Accra for research, learning, planning, proposals, campaigns and creative production.',
  applicationName: BRAND.productName,
  authors: [{ name: BRAND.name, url: BRAND.companyUrl }],
  creator: BRAND.name,
  publisher: BRAND.name,
  category: 'Artificial intelligence software',
  keywords: ['AI360', 'AI360 Lab', 'AI tools Ghana', 'AI research assistant', 'AI campaign creator', 'AI for African businesses'],
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: BRAND.siteUrl,
    title: BRAND.productName,
    description: 'Bring the goal. Understand, decide, create and leave ready to move.',
    siteName: BRAND.productName,
    locale: 'en_GH',
    images: [{ url: '/og.png', width: 1706, height: 907, alt: 'AI360 Lab, practical intelligence built from Accra' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.productName,
    description: 'Bring the goal. Understand, decide, create and leave ready to move.',
    images: ['/og.png'],
  },
  appleWebApp: {
    capable: true,
    title: BRAND.productName,
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmSans.variable}`}>
      <body><SiteStructuredData /><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
