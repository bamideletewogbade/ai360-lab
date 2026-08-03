import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google'
import './globals.css'
import './landing.css'
import { AuthProvider } from '@/components/AuthProvider'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://lab.aithreesixty.tech'),
  title: {
    default: 'AI 360 Lab',
    template: '%s | AI 360 Lab',
  },
  description: 'Learn, decide, create and complete useful work with AI 360 Lab from the Accra Innovation Center.',
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: 'https://lab.aithreesixty.tech',
    title: 'AI 360 Lab',
    description: 'An accessible AI workspace for learning, work, everyday life and public impact.',
    siteName: 'AI 360 Lab',
    images: [{ url: '/og.png', width: 1706, height: 907, alt: 'AI 360 Lab' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 360 Lab',
    description: 'An accessible AI workspace for learning, work, everyday life and public impact.',
    images: ['/og.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'AI 360 Lab',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmSans.variable}`}>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
