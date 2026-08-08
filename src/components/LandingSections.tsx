import Image from 'next/image'
import Link from 'next/link'
import { ContextVideo } from '@/components/ContextVideo'
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
    <section className="landing-proof" aria-label="What makes AI 360 different">
      <span><b>Live when it matters</b><small>Current sources when today’s facts can change the answer</small></span>
      <span><b>Built around your context</b><small>Works with your documents, voice, language and goals</small></span>
      <span><b>You stay in control</b><small>Review the plan, the cost and every important action</small></span>
      <span><b>Ends in an outcome</b><small>Plans, documents, images and work you can put to use</small></span>
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
        <p><span>✦</span> Our mission</p>
        <h2 id="mission-title">{BRAND.mission}</h2>
        <p>Built from Accra for students, builders, families, teams and public servants. AI 360 turns access to intelligence into the confidence and capacity to act.</p>
        <blockquote>“{BRAND.vision}”</blockquote>
        <Link href="/what-you-can-make">See what that looks like in real life <span aria-hidden="true">↗</span></Link>
      </div>
    </section>
  )
}

export function LandingOutcomes() {
  return (
    <section className="landing-section outcomes" id="outcomes">
      <div className="landing-section-head">
        <p><span>✦</span> What you can move forward</p>
        <h2>One place.<br />Many ways to move.</h2>
        <span>AI should expand what people can do, not ask them to learn a new language first. Choose the outcome that feels closest to yours. <Link href="/what-you-can-make">Explore real examples and costs ↗</Link></span>
      </div>
      <div className="outcome-grid">
        {OUTCOMES.map((outcome) => (
          <Link href={workspaceHref(outcome.prompt, outcome.mode)} className="outcome-card" key={outcome.number}>
            <span>{outcome.number}</span>
            <div><h3>{outcome.title}</h3><p>{outcome.copy}</p></div>
            <i aria-hidden="true">↗</i>
          </Link>
        ))}
      </div>
      <div className="launch-proof">
        <div className="launch-proof-copy">
          <p><span>✦</span> Create and launch</p>
          <h3>A direction you approve. An outcome people can see.</h3>
          <p>Studio turns one business goal into a reviewed brand direction and coordinated campaign assets. This is a real four-second output—not a stock placeholder—created only after the plan and quoted cost are approved.</p>
          <ol className="launch-proof-steps" aria-label="How Studio creates the outcome">
            <li><span>01</span><b>Bring the business goal</b></li>
            <li><span>02</span><b>Review the direction</b></li>
            <li><span>03</span><b>Approve production</b></li>
          </ol>
          <Link href={workspaceHref('Create a brand and launch campaign for this idea: ', 'studio')}>Build a campaign in Studio <span aria-hidden="true">↗</span></Link>
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

export function LandingProcess() {
  return (
    <section className="landing-process" id="how">
      <div className="process-copy">
        <p><span>✦</span> From intention to action</p>
        <h2>From “I need to…”<br />to “it’s ready.”</h2>
        <div className="process-actions">
          <Link className="process-primary" href="/app">Start with your goal <span aria-hidden="true">↗</span></Link>
          <Link className="process-detail" href="/how-it-works">See how routing, approvals, credits and safety work <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      <ol className="process-list">
        <li><span>01</span><div><b>Bring the real goal</b><small>Say what you need in ordinary language. No model names or prompt formulas.</small></div></li>
        <li><span>02</span><div><b>AI 360 chooses the path</b><small>A quick answer, current research, a structured workflow or a creative build.</small></div></li>
        <li><span>03</span><div><b>See and shape the work</b><small>Follow progress, ask for changes and approve anything important or expensive.</small></div></li>
        <li><span>04</span><div><b>Leave with something usable</b><small>Put the answer, plan, document or asset to work—and return when it needs to evolve.</small></div></li>
      </ol>
    </section>
  )
}
