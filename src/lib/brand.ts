export const BRAND = {
  name: 'AI360',
  // The product is simply AI360. It was previously "AI360 Lab"; the shorter name
  // is the canonical one everywhere in product copy, metadata and email.
  productName: 'AI360',
  studioName: 'AI360 Studio',
  legacyNames: ['AI Three Sixty', 'AI 360', 'AI360 Lab'] as const,
  siteUrl: 'https://lab.aithreesixty.tech',
  companyUrl: 'https://aithreesixty.tech',
  promise: 'Bring the goal. Leave with something you can use.',
  mission: 'Make powerful intelligence practical, local and useful to everyone.',
  vision: 'A future where the distance between an idea and the ability to act on it keeps getting smaller.',
  signature: 'Intelligence that meets you where you are and helps you finish what matters.',
} as const

export type PublicNavLink = {
  href: string
  label: string
  current?: 'what' | 'how' | 'pricing'
  external?: boolean
}

export const PUBLIC_NAV_LINKS: readonly PublicNavLink[] = [
  { href: '/what-you-can-make', label: 'What you can do', current: 'what' },
  { href: '/how-it-works', label: 'How it works', current: 'how' },
  { href: '/pricing', label: 'Plans', current: 'pricing' },
  { href: 'https://aithreesixty.tech', label: 'About AI360', external: true },
]

export const PUBLIC_FOOTER_LINKS = [
  { href: '/what-you-can-make', label: 'What you can do' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Plans' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const

export function workspaceHref(prompt?: string, mode?: 'chat' | 'agent' | 'studio') {
  const query = new URLSearchParams()
  if (prompt) query.set('prompt', prompt)
  if (mode) query.set('mode', mode)
  if (prompt) query.set('draft', '1')
  return `/app${query.size ? `?${query.toString()}` : ''}`
}
