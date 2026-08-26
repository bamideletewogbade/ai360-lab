import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google'
import type { Viewport } from 'next'
import './globals.css'
import './landing.css'
import { AuthProvider } from '@/components/AuthProvider'
import { FunnelTracker } from '@/components/FunnelTracker'
import { SiteStructuredData } from '@/components/SiteStructuredData'
import { BRAND } from '@/lib/brand'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { ASSET_RECOVERY_SCRIPT } from '@/lib/asset-recovery'

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
  keywords: ['AI360', 'AI tools Ghana', 'AI research assistant', 'AI campaign creator', 'AI for African businesses'],
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
    images: [{ url: '/og.png', width: 1706, height: 907, alt: 'AI360, practical intelligence built from Accra' }],
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before Next.js chunks so a missing deployment asset cannot
            strand the server-rendered workspace loader indefinitely. */}
        <script dangerouslySetInnerHTML={{ __html: ASSET_RECOVERY_SCRIPT }} />
        {/* Sets the theme on <html> before first paint so the app never flashes
            the wrong colours on load. Runs from the persisted choice, falling
            back to the operating-system preference. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* Browser writing assistants such as Grammarly add data attributes to
          body before React starts. The server cannot predict those attributes,
          so accept that one shallow boundary without suppressing warnings in
          the application tree itself. */}
      <body suppressHydrationWarning>
        <SiteStructuredData />
        <AuthProvider>
          {/* Inside AuthProvider because workspace entry is only counted once
              the session has resolved. Renders nothing. */}
          <FunnelTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
