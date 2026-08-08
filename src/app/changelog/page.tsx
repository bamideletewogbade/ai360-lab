import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import { BRAND } from '@/lib/brand'
import { CHANGELOG_RELEASES } from '@/lib/changelog'
import { publicPageMetadata } from '@/lib/seo'
import styles from './changelog.module.css'

export const metadata = publicPageMetadata({
  path: '/changelog',
  title: 'Product changelog',
  description: 'Follow meaningful AI360 Lab product updates across the workspace, Studio, reliability, safety and public experience.',
  keywords: ['AI360 Lab changelog', 'AI360 product updates', 'AI workspace Ghana'],
})

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'AI360 Lab product changelog',
  description: 'Meaningful product updates from AI360 Lab.',
  url: `${BRAND.siteUrl}/changelog`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: CHANGELOG_RELEASES.map((release, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: release.title,
      url: `${BRAND.siteUrl}/changelog#${release.id}`,
    })),
  },
}

export default function ChangelogPage() {
  return (
    <main className={styles.page}>
      <SiteNav current="changelog" />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Product changelog</p>
        <h1>What is changing at AI360 Lab.</h1>
        <p className={styles.intro}>
          A plain record of improvements that change what people can do, how safely the system works, or how clearly the product communicates. Internal commit noise stays internal.
        </p>
        <div className={styles.legend} aria-label="Release status key">
          <span><i className={styles.now} />Now: available in the current build</span>
          <span><i className={styles.pilot} />Pilot: available with release conditions</span>
          <span><i className={styles.foundation} />Foundation: enabling work behind the experience</span>
        </div>
      </header>

      <section className={styles.timeline} aria-label="Product releases">
        {CHANGELOG_RELEASES.map((release) => (
          <article className={styles.release} id={release.id} key={release.id}>
            <div className={styles.releaseMeta}>
              <time dateTime={release.date}>{release.displayDate}</time>
              <span data-status={release.status.toLowerCase()}>{release.status}</span>
            </div>
            <div className={styles.releaseBody}>
              <h2>{release.title}</h2>
              <p>{release.summary}</p>
              <ul>
                {release.changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <aside className={styles.note}>
        <p className={styles.eyebrow}>How we publish</p>
        <h2>Useful changes, with honest status.</h2>
        <p>We publish outcomes, material fixes and release conditions. Security details, private customer information and unverified plans are never presented as shipped features.</p>
      </aside>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <SiteFooter />
    </main>
  )
}
