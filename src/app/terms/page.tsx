import { SiteNav } from '@/components/SiteNav'
import { SiteFooter } from '@/components/SiteFooter'
import { publicPageMetadata } from '@/lib/seo'
import styles from '../legal.module.css'

export const metadata = publicPageMetadata({
  path: '/terms',
  title: 'Terms',
  description: 'Terms for responsible use, approvals, generated content, payments and service availability in AI360.',
})

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <SiteNav current="legal" />
      <div className={styles.shell}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Responsible use</p>
          <h1>Terms</h1>
          <p className={styles.updated}>Last updated August 3, 2026</p>

          <section>
            <h2>Using AI360</h2>
            <p>AI360 is an experimental learning and productivity service from AI360 and the Accra Innovation Centre. You may use it for lawful personal, educational and business tasks, subject to the usage limits shown by the service.</p>
          </section>

          <section>
            <h2>Your responsibility</h2>
            <p>AI responses can be incomplete or incorrect. Check important facts and obtain qualified review before relying on outputs for medical, legal, financial, employment or other high-impact decisions.</p>
            <p>You are responsible for the information you submit and for reviewing any email draft, calendar invite, document or action before using it.</p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <p>Do not use AI360 to break the law, harm people, invade privacy, distribute malware, bypass security, impersonate others, or interfere with the service. Automated scraping and attempts to evade rate limits are prohibited.</p>
          </section>

          <section>
            <h2>Content and availability</h2>
            <p>You retain your rights in the material you submit. AI-generated output may not be unique and may require editing. The service is provided as available, may change, and may be limited or suspended to protect users, costs and reliability.</p>
          </section>

          <section>
            <h2>Approval-gated actions</h2>
            <p className={styles.note}>The Agent may prepare suggested actions, but it will not silently send or publish them. Studio media generation uses provider credits and requires explicit approval after the estimated cost is shown. Provider pricing can change, and final image cost can vary with generated output. You must review generated media and confirm that you have the rights to use all submitted brand materials.</p>
          </section>

          <section>
            <h2>Plans and payments</h2>
            <p>Each successful payment buys one month of access and does not renew automatically. Before payment, the final amount, access period, included allowance and applicable taxes will be displayed for approval. Prices and allowances shown on the pricing page apply to the payment you are about to make; they may change for future purchases.</p>
            <p>Individuals will not receive silent renewal or usage-overage charges. If an allowance is exhausted, paid capabilities may pause until the person chooses another month or a different plan. One-time credit top-ups may be purchased separately; they do not expire and do not renew. Failed provider work should release unused reserved credits after reconciliation.</p>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
