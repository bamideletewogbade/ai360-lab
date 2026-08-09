import { SiteNav } from '@/components/SiteNav'
import { SiteFooter } from '@/components/SiteFooter'
import { publicPageMetadata } from '@/lib/seo'
import styles from '../legal.module.css'

export const metadata = publicPageMetadata({
  path: '/privacy',
  title: 'Privacy',
  description: 'How AI360 Lab handles conversations, files, voice recordings, generated media and operational information.',
})

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <SiteNav current="legal" />
      <div className={styles.shell}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Plain-language policy</p>
          <h1>Privacy</h1>
          <p className={styles.updated}>Last updated August 8, 2026</p>

          <section>
            <h2>What the Lab handles</h2>
            <p>AI360 Lab processes the prompts, files and recordings you choose to provide so it can answer questions, research topics, analyze materials and prepare exports.</p>
            <ul>
              <li>Conversation history is saved in your browser on your current device.</li>
              <li>Prompts and supported attachments are sent through our server to the configured AI provider.</li>
              <li>Voice recordings stay in your browser until you select Use transcript. The recording is then sent to the configured transcription provider and AI360 does not save a copy of the raw audio.</li>
              <li>The transcript is placed in the message box for you to review before it can become an instruction.</li>
              <li>Studio projects and approval progress are saved in your browser on your current device.</li>
              <li>When you approve media production, the approved brand direction is sent to the configured image or video provider. Generated video is temporarily retained by the provider so it can be processed and downloaded.</li>
            </ul>
          </section>

          <section>
            <h2>Live web research</h2>
            <p>When a question or project depends on current public information, AI360 Lab may automatically create a search query and retrieve relevant public webpages through the configured AI and search providers. Search queries can be derived from what you ask, so do not include confidential or sensitive information in requests that may require web research.</p>
          </section>

          <section>
            <h2>What we do not do</h2>
            <p>We do not sell your prompts, use advertising trackers, or expose the service API key to your browser. Voice recordings are not added to a training or improvement dataset. AI360 Lab does not silently generate paid media, send messages, publish posts or change external systems.</p>
          </section>

          <section>
            <h2>Operational information</h2>
            <p>Our hosting and AI service providers may process technical information such as IP address, browser type, request timing and usage metadata for security, reliability and abuse prevention. Their handling is governed by their own service terms.</p>
          </section>

          <section>
            <h2>Feedback and problem reports</h2>
            <p>When you send feedback, we save the option you choose, a technical reference and any note you add. Message content is included only when you choose to share the answer or recent conversation. Contact details are optional and are used only to follow up on that report.</p>
            <p>Rules check urgent reports first. A separate AI check may then summarize the issue and suggest a private test. A person decides sensitive actions and checks fixes before release. A report does not change or train the AI by itself.</p>
          </section>

          <section>
            <h2>Payments and billing records</h2>
            <p>When payments are activated, the selected payment provider will collect and process Mobile Money or card details. AI360 should not store your Mobile Money PIN or full card number. We will retain the payment reference, amount, currency, status, plan, billing period and necessary audit records for account access, reconciliation, refunds, fraud prevention and legal obligations.</p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>You can delete individual conversations in the Lab. You can also clear this site&apos;s browser data to remove all locally saved conversation history. Avoid submitting passwords, payment credentials, private identification numbers, health records or other highly sensitive information.</p>
          </section>

          <section>
            <h2>Questions</h2>
            <p className={styles.note}>For privacy questions, contact AI360 through <a href="https://aithreesixty.tech">aithreesixty.tech</a>.</p>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  )
}
