import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import styles from '../legal.module.css'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms for using AI 360 Lab.',
}

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.top}>
          <Link href="/" className={styles.brand}>
            <Image src="/icon-mark-black.png" alt="" width={34} height={34} />
            <b>AI 360 LAB</b>
          </Link>
          <Link href="/" className={styles.back}>Return to the Lab</Link>
        </header>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Responsible use</p>
          <h1>Terms</h1>
          <p className={styles.updated}>Last updated July 25, 2026</p>

          <section>
            <h2>Using AI 360 Lab</h2>
            <p>AI 360 Lab is an experimental learning and productivity service from AI 360 and the Accra Innovation Center. You may use it for lawful personal, educational and business tasks, subject to the usage limits shown by the service.</p>
          </section>

          <section>
            <h2>Your responsibility</h2>
            <p>AI responses can be incomplete or incorrect. Check important facts and obtain qualified review before relying on outputs for medical, legal, financial, employment or other high-impact decisions.</p>
            <p>You are responsible for the information you submit and for reviewing any email draft, calendar invite, document or action before using it.</p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <p>Do not use the Lab to break the law, harm people, invade privacy, distribute malware, bypass security, impersonate others, or interfere with the service. Automated scraping and attempts to evade rate limits are prohibited.</p>
          </section>

          <section>
            <h2>Content and availability</h2>
            <p>You retain your rights in the material you submit. AI-generated output may not be unique and may require editing. The service is provided as available, may change during the pilot, and may be limited or suspended to protect users, costs and reliability.</p>
          </section>

          <section>
            <h2>Approval-gated actions</h2>
            <p className={styles.note}>The Agent may prepare suggested actions, but it will not silently send or publish them. Studio media generation uses provider credits and requires explicit approval after the estimated cost is shown. Provider pricing can change, and final image cost can vary with generated output. You must review generated media and confirm that you have the rights to use all submitted brand materials.</p>
          </section>
        </article>
      </div>
    </main>
  )
}
