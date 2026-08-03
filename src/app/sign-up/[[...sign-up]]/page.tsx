import type { Metadata } from 'next'
import { AuthPage } from '@/components/AuthPage'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create an AI 360 account and keep your work across devices.',
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />
}
