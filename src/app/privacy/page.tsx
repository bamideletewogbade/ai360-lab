import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import styles from '../legal.module.css'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How AI 360 Lab handles conversations, files and voice recordings.',
}

export default function PrivacyPage() {
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
          <p className={styles.eyebrow}>Plain-language policy</p>
          <h1>Privacy</h1>
          <p className={styles.updated}>Last updated August 3, 2026</p>

          <section>
            <h2>What the Lab handles</h2>
            <p>AI 360 Lab processes the prompts, files and recordings you choose to provide so it can answer questions, research topics, analyze materials and prepare exports.</p>
            <ul>
              <li>Conversation history is saved in your browser on your current device.</li>
              <li>Prompts and supported attachments are sent through our server to the configured AI provider.</li>
              <li>Voice recordings are sent for transcription only after you select Use transcript.</li>
              <li>Studio projects and approval progress are saved in your browser on your current device.</li>
              <li>When you approve media production, the approved brand direction is sent to the configured image or video provider. Generated video is temporarily retained by the provider so it can be processed and downloaded.</li>
            </ul>
          </section>

          <section>
            <h2>Live web research</h2>
            <p>When a question or project depends on current public information, AI 360 Lab may automatically create a search query and retrieve relevant public webpages through the configured AI and search providers. Search queries can be derived from what you ask, so do not include confidential or sensitive information in requests that may require web research.</p>
          </section>

          <section>
            <h2>What we do not do</h2>
            <p>We do not sell your prompts, use advertising trackers, or expose the service API key to your browser. AI 360 Lab does not silently generate paid media, send messages, publish posts or change external systems.</p>
          </section>

          <section>
            <h2>Operational information</h2>
            <p>Our hosting and AI service providers may process technical information such as IP address, browser type, request timing and usage metadata for security, reliability and abuse prevention. Their handling is governed by their own service terms.</p>
          </section>

          <section>
            <h2>Payments and billing records</h2>
            <p>When payments are activated, the selected payment provider will collect and process Mobile Money or card details. AI 360 should not store your Mobile Money PIN or full card number. We will retain the payment reference, amount, currency, status, plan, billing period and necessary audit records for account access, reconciliation, refunds, fraud prevention and legal obligations.</p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>You can delete individual conversations in the Lab. You can also clear this site&apos;s browser data to remove all locally saved conversation history. Avoid submitting passwords, payment credentials, private identification numbers, health records or other highly sensitive information.</p>
          </section>

          <section>
            <h2>Questions</h2>
            <p className={styles.note}>For privacy questions, contact AI 360 through <a href="https://aithreesixty.tech">aithreesixty.tech</a>.</p>
          </section>
        </article>
      </div>
    </main>
  )
}
