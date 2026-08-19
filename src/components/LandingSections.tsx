import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRightIcon } from '@/components/ArrowUpRightIcon'
import { ContextVideo } from '@/components/ContextVideo'
import { StartCta } from '@/components/StartCta'
import { BRAND, workspaceHref } from '@/lib/brand'

const OUTCOMES = [
  { number: '01', title: 'Learn something difficult', copy: 'Get a clear explanation, examples that fit your context and a way to check what you understand.', mode: 'chat', prompt: 'Help me understand this difficult topic clearly, then check what I learned: ' },
  { number: '02', title: 'Prepare for an opportunity', copy: 'Research the role, sharpen your story and leave with an application or interview plan you can use.', mode: 'agent', prompt: 'Help me prepare properly for this opportunity and create the materials I need: ' },
  { number: '03', title: 'Bring order to everyday life', copy: 'Turn competing responsibilities, decisions or events into a practical plan you can actually follow.', mode: 'chat', prompt: 'Help me organise this into a calm, practical plan I can follow: ' },
  { number: '04', title: 'Launch or grow an idea', copy: 'Shape the brand, campaign, proposal, image or video that moves a venture into the world.', mode: 'studio', prompt: 'Help me shape and launch this idea with a clear direction and useful assets: ' },
  { number: '05', title: 'Move a community project forward', copy: 'Research the need, build the programme and prepare the case for partners, funders or participants.', mode: 'agent', prompt: 'Help me turn this community goal into a researched, practical programme plan: ' },
  { number: '06', title: 'Make public information clearer', copy: 'Turn evidence and policy into plain-language briefs, programmes and communication people can act on.', mode: 'agent', prompt: 'Help me turn this public-service information into clear guidance people can understand and use: ' },
] as const

export function LandingProof() {
  return (
    <section className="landing-proof" aria-label="What makes AI360 different">
      <span><b>Live when it matters</b><small>Current sources when today’s facts can change the answer</small></span>
      <span><b>Built around your context</b><small>Works with your documents, voice, language and goals</small></span>
      <span><b>You stay in control</b><small>Review the plan, the cost and every important action</small></span>
      {/* The old copy said "documents" and left the reader to guess what that
          meant. Naming the formats is the difference between a claim and a
          promise, and files are the most tangible thing the product hands over. */}
      <span><b>Ends in a real file</b><small>Finished PDF, Word, Excel and PowerPoint files, images and video you can send today</small></span>
    </section>
  )
}

export function LandingMission() {
  return (
    <section className="landing-mission" aria-labelledby="mission-title">
      <Image
        src="/mission-work-in-motion.webp"
        alt="Three people in Accra working together on study, business and community materials"
        fill
        sizes="100vw"
      />
      <div className="mission-shade" />
      <div className="mission-copy">
        <p>Our mission</p>
        <h2 id="mission-title">{BRAND.mission}</h2>
        <p>Built from Accra for students, builders, families, teams and public servants. AI360 turns access to intelligence into the confidence and capacity to act.</p>
        <blockquote>“{BRAND.vision}”</blockquote>
        <Link href="/what-you-can-make">See what that looks like in real life</Link>
      </div>
    </section>
  )
}

export function LandingOutcomes() {
  return (
    <section className="landing-section outcomes" id="outcomes">
      <div className="landing-section-head">
        <p>What you can move forward</p>
        <h2>One place.<br />Many ways to move.</h2>
        <span>AI should expand what people can do, not ask them to learn a new language first. Choose the outcome that feels closest to yours. <Link href="/what-you-can-make">Explore real examples and costs</Link></span>
      </div>
      <div className="outcome-grid">
        {OUTCOMES.map((outcome) => (
          <Link href={workspaceHref(outcome.prompt, outcome.mode)} className="outcome-card" key={outcome.number}>
            <span>{outcome.number}</span>
            <div><h3>{outcome.title}</h3><p>{outcome.copy}</p></div>
            <ArrowUpRightIcon className="outcome-direction" />
          </Link>
        ))}
      </div>
      <div className="launch-proof">
        <div className="launch-proof-copy">
          <p>Create and launch</p>
          <h3>A direction you approve. An outcome people can see.</h3>
          <p>Studio turns one business goal into a reviewed brand direction and coordinated campaign assets. This is a real four-second output, not a stock placeholder. It is created only after the plan and quoted cost are approved.</p>
          <ol className="launch-proof-steps" aria-label="How Studio creates the outcome">
            <li><span>01</span><b>Bring the business goal</b></li>
            <li><span>02</span><b>Review the direction</b></li>
            <li><span>03</span><b>Approve production</b></li>
          </ol>
          <Link href={workspaceHref('Create a brand and launch campaign for this idea: ', 'studio')}>Build a campaign in Studio</Link>
        </div>
        <div className="launch-proof-stage">
          <div className="launch-proof-trace">
            <div>
              <span>01 · Brief</span>
              <blockquote>“Launch a modern hibiscus drink for busy people in Accra.”</blockquote>
            </div>
            <i aria-hidden="true"><span /><span /><span /></i>
            <div>
              <span>02 · Approved direction</span>
              <b>Warm. Grounded. Unmistakably local.</b>
              <small>Audience, message and visual system locked before production.</small>
            </div>
          </div>
          <ContextVideo
            className="launch-proof-video"
            src="/studio-outcome-reel.mp4"
            poster="/studio-outcome-reel-poster.webp"
            eyebrow="03 · Generated outcome"
            title="Sankofa Harvest launch reel"
            caption="One approved scene, rendered as a silent vertical clip for social media."
            overlayLabel="Sankofa Harvest"
            overlaySubline="Hibiscus · Ginger · Accra"
          />
        </div>
      </div>
    </section>
  )
}

/**
 * What AI360 can actually do.
 *
 * The page had outcomes and a process but never the capabilities themselves,
 * so the most differentiating thing the product does — producing the finished
 * file without being asked for one — was sold nowhere. Every claim here is a
 * shipped behaviour: the languages are the ones in `languages.ts`, files really
 * are free (`FEATURE_WEIGHTS.export` is all zeros), and failed work really does
 * refund in full.
 */
export function LandingCapabilities() {
  return (
    <section className="landing-section capabilities" id="capabilities">
      <div className="landing-section-head">
        <p>What it can do</p>
        <h2>Ask for the work.<br />Get the work.</h2>
        <span>Not a chat box with extra buttons. AI360 does the thinking, then hands you the thing you actually needed.</span>
      </div>

      <div className="capability-lead">
        <div className="capability-lead-copy">
          <p>New</p>
          <h3>It makes the file for you.</h3>
          <p>
            You should not have to know you wanted a spreadsheet. Ask for a price
            list, a proposal or a report, and AI360 writes it, builds the file and
            attaches it to the answer — PDF, Word, Excel or PowerPoint, ready to send. It is
            kept in your workspace, so it is still there tomorrow, on another phone.
          </p>
          <Link href={workspaceHref('Make me a wholesale price list I can send to buyers: ', 'chat')}>
            Ask for a file
          </Link>
        </div>
        <ul className="capability-lead-formats" aria-label="File formats AI360 produces">
          <li><b>PDF</b><small>Fixed layout, ready to print or send</small></li>
          <li><b>Word</b><small>Editable document you can keep working on</small></li>
          <li><b>Excel</b><small>Real numbers in real cells, one sheet per table</small></li>
        </ul>
      </div>

      <div className="capability-grid">
        <article>
          <h3>Speaks the way Ghana speaks</h3>
          <p>English, Twi, Gã, Eʋegbe and Pidgin. Type it, or say it out loud and let AI360 write it down.</p>
        </article>
        <article>
          <h3>Survives a dropped line</h3>
          <p>Close the tab, lose the network, switch phone. Work that was running is still running when you come back.</p>
        </article>
        <article>
          <h3>Projects that remember</h3>
          <p>A project holds its brief, its files and its own conversations, so you never explain your business twice.</p>
        </article>
        <article>
          <h3>The price before it runs</h3>
          <p>Anything that costs is quoted first and refunded in full if it fails. Documents cost nothing at all.</p>
        </article>
      </div>
    </section>
  )
}

export function LandingProcess() {
  return (
    <section className="landing-process" id="how">
      <div className="process-copy">
        <p>From intention to action</p>
        <h2>From “I need to…”<br />to “it’s ready.”</h2>
        <div className="process-actions">
          <StartCta className="process-primary" />
          <Link className="process-detail" href="/how-it-works">See how routing, approvals, credits and safety work</Link>
        </div>
      </div>
      <ol className="process-list">
        <li><span>01</span><div><b>Bring the real goal</b><small>Say what you need in ordinary language. No model names or prompt formulas.</small></div></li>
        <li><span>02</span><div><b>AI360 chooses the path</b><small>A quick answer, current research, a structured workflow or a creative build.</small></div></li>
        <li><span>03</span><div><b>See and shape the work</b><small>Follow progress, ask for changes and approve anything important or expensive.</small></div></li>
        <li><span>04</span><div><b>Leave with something usable</b><small>Put the answer, plan, document or asset to work. Return when it needs to evolve.</small></div></li>
      </ol>
    </section>
  )
}
