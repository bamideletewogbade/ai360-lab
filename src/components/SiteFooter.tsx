import Image from 'next/image'
import Link from 'next/link'
import { BRAND, PUBLIC_FOOTER_LINKS } from '@/lib/brand'

export function SiteFooter({ className, showLogo = false }: { className: string; showLogo?: boolean }) {
  return (
    <footer className={className}>
      {showLogo && <Image src="/logo-black.png" width={146} height={36} alt="AI Three Sixty" />}
      <p>{BRAND.signature} <span>·</span> Built from Accra.</p>
      <div>
        {PUBLIC_FOOTER_LINKS.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
      </div>
    </footer>
  )
}
