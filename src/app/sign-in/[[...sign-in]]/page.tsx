import type { Metadata } from 'next'
import { AuthPage } from '@/components/AuthPage'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to continue your work in AI360 Lab.',
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  return <AuthPage mode="sign-in" />
}
