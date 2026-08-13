import Image from 'next/image'
import Link from 'next/link'
import styles from './SiteFooter.module.css'

const exploreLinks = [
  { href: '/what-you-can-make', label: 'What you can do' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Plans' },
]

const organisationLinks = [
  { href: 'https://accrainnovationcenter.com/', label: 'Visit AIC' },
  { href: 'https://accrainnovationcenter.com/spaces/', label: 'Spaces' },
  { href: 'https://accrainnovationcenter.com/contact-us/', label: 'Contact AIC' },
]

const directionsUrl = 'https://www.google.com/maps/search/?api=1&query=GD-253-5017'

export function SiteFooter() {
  return (
    <footer className={styles.footer} id="site-footer">
      <div className={styles.shell}>
        <div className={styles.lead}>
          <div className={styles.intro}>
            <Image className={styles.logo} src="/logo-white.png" width={176} height={44} alt="AI360" />
            <p className={styles.eyebrow}>AI360 Ã— Accra Innovation Centre</p>
            <h2>Built in Accra.<br />Ready for real work.</h2>
            <p className={styles.summary}>
              Bring the goal. AI360 helps you research, decide and make the work while you stay in control.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/app">Start with a goal <span aria-hidden="true">â†—</span></Link>
              <a className={styles.secondaryAction} href="https://accrainnovationcenter.com/" target="_blank" rel="noreferrer">
                Visit AIC <span aria-hidden="true">â†—</span>
              </a>
            </div>
          </div>

          <address className={styles.addressCard}>
            <span className={styles.cardNumber}>05Â° 39â€² N Â· ACCRA</span>
            <span className={styles.cardLabel}>Our home</span>
            <strong>AIC House</strong>
            <span>Kofi Anum Tesa Street</span>
            <span>Adjirigano, East Legon</span>
            <span>Accra, Ghana</span>
            <a href={directionsUrl} target="_blank" rel="noreferrer">
              GPS GD-253-5017 <span aria-hidden="true">â†—</span>
            </a>
          </address>
        </div>

        <div className={styles.directory}>
          <div className={styles.linkGroup}>
            <h3>Explore</h3>
            {exploreLinks.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
          </div>

          <div className={styles.linkGroup}>
            <h3>AI360</h3>
            <a href="https://aithreesixty.tech" target="_blank" rel="noreferrer">About AI360</a>
            <Link href="/app">Open AI360</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>

          <div className={styles.linkGroup}>
            <h3>Accra Innovation Centre</h3>
            {organisationLinks.map((link) => (
              <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label}</a>
            ))}
          </div>

          <div className={styles.linkGroup}>
            <h3>Connect</h3>
            <a href="mailto:info@accrainnovationcentre.com">Email the centre</a>
            <a href="tel:+233256120157">+233 (0) 256 120 157</a>
            <a href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a>
          </div>
        </div>

        <div className={styles.bottom}>
          <p>Â© {new Date().getFullYear()} AI360 Â· Accra Innovation Centre</p>
          <p>Intelligence that moves with you.</p>
        </div>
      </div>
    </footer>
  )
}
