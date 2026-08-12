import type { Metadata } from 'next'
import { AuthPage } from '@/components/AuthPage'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create an AI360 account and keep your work connected.',
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />
}
