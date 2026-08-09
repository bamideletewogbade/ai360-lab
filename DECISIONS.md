# Decision and incident log

## 2026-08-09 · Decision · One conversational surface, projects as context

**Why.** Ask, Research and Create are not three equal destinations. Ask is the
default interaction, Research is a capability, and Create is what happens when
work becomes a durable project. Making people choose among them before stating
their goal exposed our architecture and made the product harder to understand.

**Decision.** AI360 now begins with one conversation. It routes a new request to
direct help or sourced research from the language of the request. Projects are
opened from the sidebar as durable workspaces, and a new project starts from a
blank conversational prompt. Internal project packs remain orchestration data;
examples are optional inspiration rather than the front door.

**Implementation.** The global mode switch and first-use intent modal were
removed. `/api/studio/brief` turns ordinary project conversation into a visible,
correctable brief and silently selects the internal workflow. The setup screen
keeps conversation and live brief side by side, while mobile stacks them.
Global feedback moved into the sidebar; response feedback stays with its answer.
Voice recording uses mixed-language detection and reply language stays in the
composer.

**Guardrail.** Automatic routing may change the method, never the customer's
goal. No project build starts until the visible brief is complete and the
customer presses Build.

## 2026-08-09 · Decision · Modes describe intentions and projects keep their identity

**Why.** The workspace mixed `Quick`, `Research`, `Create`, `Ask`, `Agent` and
`Build`. Those labels described different kinds of things. Worse, changing a
conversation to Create changed its stored experience and made an ordinary chat
appear under a Projects heading. The interface therefore taught a false mental
model of the product.

**Decision.** The three user intentions are Ask, Research and Create. Ask owns
conversations, Research owns sourced research threads, and Create owns durable
business projects. The primary navigation no longer exposes provider/model
names. The Start new work action opens the outcome chooser. The Create project
choices appear before the large proof example.

**Implementation.** `src/app/app/page.tsx` now preserves completed conversation
identity when a mode changes and excludes Studio placeholders from chat history.
`StudioWorkspace` presents its real durable project store as the Create home.
The six-pack coordinator is now connected to that project store. The interface
shows its real streamed specialist states, normalizes sections into reviewable
deliverables, records the pack promise and quality result, and keeps versions
when a deliverable is improved.

**Product architecture.** See `PRODUCT_EXPERIENCE_ARCHITECTURE.md` for the mode
matrix, bounded-loop rationale, Ghana and African context, evaluation plan and
the next Create integration boundary.

Choices that would otherwise be re-argued, and faults that must never be
rediscovered. Newest first. Each entry records what was decided, why, and what
would have to change for the decision to be revisited.

The team-facing operating guide is `TECHNICAL_HANDBOOK.md`; measured numbers and
the layer-by-layer architecture remain in this log and `SYSTEM_ARCHITECTURE.md`.

---

## 2026-08-08 · Decision · ExpressPay is hosted, query-verified and manually renewed

AI360 uses ExpressPay's Merchant API and sends the customer to ExpressPay's
hosted payment page. AI360 stores the order, price and expected currency before
the redirect, then treats both the browser return and delayed post-url as
untrusted signals. A server-side Query must match token, order, amount and GHS
before one locked transaction activates the plan and appends the credit grant.

**Why.** This keeps card numbers, security codes and wallet authorization out
of AI360 while making delayed Mobile Money and duplicate delivery safe. The
provider adapter owns wire formats; the repository owns money-state invariants;
the plans and ledger remain portable if the provider changes.

Monthly access is a fresh customer-authorized payment. No reusable payment
token is requested or stored. A throttled status check provides recovery when a
delayed notification is missed, and production billing remains disabled until
the complete sandbox matrix passes.

**Revisit if.** ExpressPay approves a documented recurring contract whose
customer consent, cancellation, failure recovery and token security are tested,
or if reliability and feature measurements justify swapping the adapter.

---

## 2026-08-08 · Decision · Quality reports use rules first, AI second and people for consequential actions

Customer feedback is stored as a separate quality domain with opt-in evidence
and contact details. Fixed rules assign urgency before a separate evaluator can
summarize the issue, propose a test or recommend a fix. The evaluator cannot
lower urgency or execute a consequential action. A reviewer owns sensitive
decisions, customer updates and final verification.

**Why.** The system must learn from failures without allowing the same model to
be the final judge of its own behavior. Durable receipts make the process
visible to customers, while approved test candidates turn repeated failures
into measurable release gates.

**Revisit if.** Independent evaluations demonstrate that another bounded action
is safe, reversible, fully audited and materially reduces response time. Human
approval remains mandatory for customer contact, containment and release.

---

## 2026-08-08 · Decision · Public pricing is a monthly, research-calibrated pilot

Explorer remains GH₵0 for 5 credits and Everyday remains GH₵125 for 120.
Builder is GH₵350 for 400 credits. Team is GH₵1,200 for 1,400 shared credits,
five people and assisted onboarding.

**Why.** Everyday preserves the accessible Ghana-first entry point. The higher
Builder and Team prices reduce their full-utilisation AI cost shares from 34.7%
and 40.4% to 29.7% and 30.3%, while keeping enough credits to complete a useful
project. Assisted Team onboarding lets us learn procurement, controls and
support load before promising self-serve operation.

**Operational boundary.** Annual purchasing is not accepted by the page or the
checkout contract. It can return only after monthly renewal, reversal, refund
and reconciliation flows are proven with real cohorts.

**Revisit if.** Four weeks of cohort data shows activation, paid utilisation,
contribution margin or willingness to pay outside the ranges in
`PRICING_STRATEGY.md`.

---

## 2026-08-05 · Incident · Chat could not answer a single message

**What happened.** Every `/api/chat` request returned "The Lab could not reach
its AI provider." Live. Agent research and Studio research were affected too.

**Cause.** OpenRouter's server-side tools cannot be combined with provider
routing constraints. Probed against the live API:

| Sent alongside tools | Result |
| --- | --- |
| no provider block | 200 |
| `preferred_max_latency` | 200 |
| `require_parameters` | 404, matches no provider |
| `sort`, `allow_fallbacks`, `preferred_min_throughput`, `max_price` | 500 each |

Chat attaches tools on every request and also sent the full provider block.

**Fix.** `providerPreferences(workload, { withTools })` drops the incompatible
fields whenever tools are attached. A test asserts they are absent.

**Revisit if.** OpenRouter documents support for routing constraints with
server-side tools. Re-run the probe before trusting it.

---

## 2026-08-05 · Incident · The agent returned empty answers

**What happened.** Runs completed but produced "The agent completed its work but
returned no readable result."

**Cause.** `google/gemini-3.6-flash` reasons by default and refuses to have it
disabled ("Reasoning is mandatory for this endpoint"). Uncapped, reasoning
consumed the whole `max_tokens` budget and the response finished on `length`
with 65 characters of content before any answer was written.

**Fix.** `REASONING_BUDGET` caps reasoning tokens on every agent and chat call.
Models that do not reason ignore it.

**Revisit if.** The default model changes. Check `finish_reason` on a long
generation before shipping any new default.

---

## 2026-08-05 · Incident · All text work routed to the multimodal model

**What happened.** Research runs cost $0.0288 and took 70 seconds.

**Cause.** `routeFor` chose the multimodal model for any workload that was not
chat, including planning and writing, which never look at an image. That model
measured ~107x more expensive per call than the fast text model
($0.002982 vs $0.0000278 on an identical prompt).

**Fix.** Route on whether there is actually something to look at
(`hasAttachments` / `hasVideo`), not on workload type. Same run afterwards:
$0.0063 and 18.5 seconds.

**Revisit if.** A task genuinely needs vision without carrying an attachment.

---

## 2026-08-07 · Decision · The Create coordinator runs specialists, some at the same time

`src/lib/studio/coordinator.ts` executes a pack: stages in sequence, specialists
inside a stage concurrently, each seeing what earlier stages produced. Streams
progress over `/api/studio/pack` as NDJSON, the same shape the agent uses.

**The parallelism is real, not decorative.** Verified live: in the marketing
pack the copywriter and the calendar both completed at the same second. This
matters because the progress view is meant to show work happening, and an
animation over a single long request would be a lie about what the product does.

**Verified end to end, 7 August 2026.**

| Pack | Specialists | Time | Cost | Of reserved budget |
| --- | --- | ---: | ---: | ---: |
| Name and domain | Namer, then Domains | 22s | $0.0098 | 19% |
| Marketing pack | Researcher, Campaign, then Copywriter and Calendar together | 43s | $0.0544 | 39% |

The naming pack checked sixteen domains and reported them honestly: `.com`
candidates taken, every `.com.gh` returned as cannot confirm rather than guessed.

**Design choices worth keeping.**

- A pack is reserved once up front, not charged per specialist, because it is
  one purchase to the person paying for it.
- Only the researcher and the domain checker are given tools. Every other
  specialist is called with none defined, the same schema-level rule the agent
  uses.
- The domain checker is not a model. The namer ends its output with a
  `DOMAINS:` line, and the checker asks real registries.
- A specialist that fails marks its own section failed and the rest of the pack
  continues, so one bad stage does not lose the whole thing.
- The run outlives its connection, like the agent.
- Sections are streamed as each completes, so the first output is readable long
  before the pack finishes.

**Closed on 9 August 2026.** `StudioWorkspace` now reads this stream directly.
All six registry outcomes are customer-selectable, the displayed specialists
and progress come from coordinator events, and final sections are normalized
into the durable project model. A deterministic quality gate checks every
section and may run one bounded correction pass without exceeding the reserved
pack budget.

---

## 2026-08-07 · Incident · Video progress went blank part way through every clip

**What happened.** During an end to end run, the status display stopped updating
about a third of the way through generation and stayed blank for forty seconds.

**Cause.** Our own rate limit. `studio_video_status` allowed 8 checks a minute,
halved to 4 for anyone not signed in. A clip takes about 80 seconds, so a UI
polling every 5 seconds is throttled after 4 checks.

**Fix.** Cheap reads and expensive work now have separate budgets. Checking on a
job is a read that costs nothing and is allowed 40 a minute; generating a clip
still costs money and is still 1 a minute. The same reasoning was applied to
`/api/agent/runs/[runId]`, where throttling recovery would punish exactly the
situation it exists for.

**Only found by running a real generation and watching it.** No unit test would
have caught a limit that is correct in isolation and wrong against the duration
of the thing it monitors.

---

## 2026-08-07 · Decision · Seedance is quoted from a measurement, and it is not cheap

The catalogue lists `bytedance/seedance-2.0-fast` at $0.0538, which reads as the
cheapest video option available. That is a per-token rate, not a clip price.

**Generating one real clip in the Studio format cost $0.4838.** That is four
times `veo-3.1-lite` at $0.12, and 140% of what twenty credits buys. Using it
would need the video weight raised from 20 credits to about 29.

**Token priced models are now quoted from a measurement** rather than excluded
outright. `MEASURED_CLIP_USD` records the figure and the date it was taken. A
measured price only applies to the exact format it was measured in, because cost
scales with the clip, and an unmeasured token priced model still returns null.

**Re-measure when a model version changes.** A stale figure here is worse than
no figure, because it would be quoted with confidence.

---

## 2026-08-07 · Verified · Full product run against live providers

| Path | Time | Cost | Result |
| --- | ---: | ---: | --- |
| Chat | 7.4s | negligible | answers |
| Chat in Twi | - | negligible | replied in Twi to an English question |
| Research agent | 17.4s | $0.0063 | 67 streamed chunks, 4 sources |
| Image | 15.1s | $0.0026 | 1.6 MB image returned |
| Video quote | instant | - | $0.12 quoted before anything ran |
| Video generation | 79s | $0.1200 | clip completed, download ready |

Seven of seven passed. `openai/gpt-image-1-mini` works despite being absent from
the default models listing, so it is not the broken default it first appeared.

---

## 2026-08-06 · Decision · Create produces six outcomes, not one

Studio was a single hardcoded outcome: a brand and launch pack of exactly eight
assets, written into the prompt and the JSON schema. Right for a business
starting from nothing, wrong for the far more common case of a business that
already exists and needs one specific thing.

`src/lib/studio/packs.ts` is now a registry. A pack declares the specialists it
runs and what each produces, so adding an outcome is data rather than a rewrite.

| Pack | For | Credits |
| --- | --- | ---: |
| Brand and launch | No brand yet | 8 |
| Marketing pack | Brand exists, needs a push | 8 |
| Ads generator | About to spend on ads | 5 |
| Name and domain | Stuck on what to call it | 3 |
| Pitch pack | Approaching a funder or big customer | 7 |
| Content calendar | Runs out of things to say | 5 |

**Costs come from the same weights the rest of the product bills**, and are
capped at the agent ceiling. A pack is one piece of work to the person paying,
so it must never quietly cost more than the priciest thing they have already
been quoted. A test enforces the cap and that a name search costs less than a
whole brand.

**Only researcher and domains reach the network.** Same rule as the agent:
capability is granted by the schema, not by asking nicely.

---

## 2026-08-06 · Decision · The domain finder tells the truth, including when it does not know

Verdicts are `taken`, `available` and `unknown`. Two sources, neither sufficient:

- **RDAP**, the registry protocol that replaced WHOIS. Where a registry
  publishes it, a 404 genuinely means unregistered.
- **DNS over HTTPS.** A name with live nameservers is definitely registered.

**The trap this avoids.** `.gh` publishes no RDAP service, and rdap.org returns
404 for every `.gh` name. Trusting it would have told a Ghanaian business that
`mtn.com.gh` was available. Verified live: RDAP said available, DNS said
registered, and DNS is right.

The reverse never holds either. `ecobank.com.gh` has no NS record and is
certainly not free, which is why a missing DNS record can never mean available.

**So for `.gh` we can only ever say taken or unknown**, and the unknown message
tells the person to confirm with the registrar. Being useless about a fact is
better than being confidently wrong about it, especially in our home market.

Suffixes are only added to the trusted list after checking a known-registered
name under them. `npm run domains:verify` proves the answers against real
registries, 6 of 6, including the `mtn.com.gh` case specifically.

---

## 2026-08-06 · Decision · Tests can now cover modules that use the `@/` alias

`npm test` registers a resolver hook, so the suite is no longer restricted to
modules with zero imports. That restriction is why guardrails, usage and the
credit gate had no coverage.

---

## 2026-08-05 · Decision · Media tiers, and models we cannot quote are excluded

Video is chosen by tier (Draft, Standard, Premium), never by model name, matching
the agent's depth control. `src/lib/media/video-catalogue.ts` prices the live
catalogue and picks the best model per tier that fits both the Studio clip format
and the budget the person's credits actually buy.

**The video price question is answered.** Twenty credits buys $0.3447. A four
second 720p vertical clip on `google/veo-3.1-lite` costs **$0.12**, 35% of that.
The range published on the pricing page is safe.

**Providers price clips four different ways**, verified live:

| Shape | Example | Handled |
| --- | --- | --- |
| `duration_seconds_*`, dollars per second | Veo, Kling, MiniMax | yes |
| `cents_per_second_output` plus a minimum per generation | Runway | yes |
| `video_tokens`, dollars per generated token | Seedance, Sora, Grok | **excluded** |
| nothing usable published | several | excluded |

**Token-priced models are deliberately excluded.** Their cost depends on the
clip that comes out, not the one requested, so they cannot be quoted before
generation. A quote we cannot make is a credit reservation we would be guessing
at, and the entire point of the quote is that the person sees the real number
before agreeing. `clipPriceUsd` returns null rather than zero so an unpriceable
model can never silently become a selection.

**A tier never substitutes across tiers.** If nothing in a tier's list is
affordable it reports itself unavailable. Quietly serving a cheaper model would
mean charging for Premium and delivering Draft.

**Open decision.** Premium currently resolves to the same model as Standard,
because the genuinely better model costs $0.80 against a $0.3447 allowance.
Either raise the video credit weight for a Premium tier, or drop the tier.

**Verified.** `npm run media:verify` checks every tier against the provider's
live prices. Run it after any pricing change and before trusting the pricing page.

---

## 2026-08-05 · Decision · A run outlives the connection that started it

Agent work used to live entirely inside its HTTP request. When the connection
dropped, which is the normal case on a Ghanaian mobile network, the work was
abandoned and the reserved credits sat stranded until the hold expired.

**What changed.**

- The stream is now only a *view* of the run. Writing to a closed connection is
  ignored and the work carries on. Verified by aborting mid run: the log shows
  `agent.client_disconnected`, then `execute:task_1` and `synthesise` completing
  anyway, then `outcome=success`.
- Progress and the finished answer are written to `lab_agent_runs` at every
  visible boundary, so there is something to come back to.
- The run announces its id as its first event, so the client never has to infer
  it from the request id.
- `GET /api/agent/runs/<id>` returns progress, plan, answer, sources and cost.
- The client polls that endpoint when its stream breaks, and reattaches to any
  unfinished run when the workspace is reopened.

**Why polling rather than a resumable stream.** A long lived connection is
precisely the thing that just failed. Recovery must not depend on holding one
open.

**Deliberate limits, and they matter.**

- **Only signed-in runs are recoverable.** A run must belong to a workspace to
  be stored, so guests get `recoverable: false`. This is consistent, because
  agent work already requires sign-in once Clerk is configured, but it means the
  guest experience still loses work.
- **This survives connection loss, not process restart.** The work continues in
  the same Node process. A deploy or a crash still kills it. Surviving that
  needs a worker consuming a queue, which is a separate piece of infrastructure.
  Do not describe this as durable execution.

**Verified.** `npm run runs:verify`, 10 of 10 against the live database,
including that another workspace cannot read a run even knowing its id.

---

## 2026-08-05 · Incident · Selecting Ga did nothing when the question was in English

**What happened.** With Ga selected, an English question came back answered in
English. Three of three attempts. Twi, Ewe and Pidgin worked.

**Cause.** The directive said "if they write to you in a different language,
reply in the one they wrote in". English *is* a different language, so an
English question read as permission to answer in English. The rule sounded
correct and quietly cancelled the whole feature.

The behaviour it was meant to allow is real: someone writing in Twi should get
Twi back regardless of the setting. The mistake was not scoping it.

**Fix.** Mirroring now applies only to the other Ghanaian languages we support,
and the directive says explicitly that people often type in English because a
local keyboard is slow on a phone, and that this is not a request to switch.
Re-probed: three of three replies in Ga.

**Revisit if.** A new language is added, or the default model changes. Re-run
the six-case route probe rather than assuming.

---

## 2026-08-05 · Decision · Ghanaian languages are a first-class setting

Twi, Ga, Ewe and Ghanaian Pidgin are selectable in Quick and Research, named the
way their own speakers name them (Gã, Eʋegbe), and applied to the agent's plan
and answer as well as chat.

**Why.** For a large part of the pilot market the barrier is not the thinking,
it is having to do the thinking in English. This is also the clearest thing we
can do that a general assistant will not do for Ghana.

**Deliberate choices.**

- Selecting a language is optional. Writing in Twi with English selected still
  returns Twi. The setting exists for people who find typing Twi slow.
- Borrowing English words inside a local sentence is instructed as *correct*.
  Accra speaks that way, and inventing an unfamiliar word for "invoice" would
  serve people worse.
- Research findings stay in the source language. Only the plan and the final
  answer are translated, because translating evidence early loses accuracy.
- Ga and Ewe carry extra guidance to keep sentences short and concrete, because
  model support for them is thinner than for Twi.

**Not established.** That the output is *good*. The checks prove the system
produces the language, not that a Ga speaker would find it natural. Native
speaker review is required before this is described as finished.

**Known gap.** Voice input is English only. Speech recognition has no meaningful
Twi, Ga or Ewe support, which means the people most helped by speaking rather
than typing are still excluded.

---

## 2026-08-05 · Decision · MySQL retired, Supabase Postgres is the only database

Conversations, messages, studio projects, usage events and the Clerk identity
webhook were ported from MySQL to Postgres. `src/lib/mysql.ts`,
`database/schema.sql`, `scripts/migrate-mysql.mjs` and the `mysql2` dependency
are deleted. `selectedDatabaseProvider()` now returns only `postgres` or `none`,
so a stale `DATABASE_PROVIDER=mysql` in an environment cannot resurrect a second
data plane.

**No data was migrated, and none needed to be.** Every write path required both
MySQL credentials and an authenticated Clerk user. Clerk has never been
configured in any environment, so no authenticated user has ever existed and no
row could have been written. Confirm before assuming the same of any future
environment.

**Behaviour deliberately preserved during the port.**

- Conversation sync stays client-authoritative: anything the client stops
  sending is deleted. Messages now cascade from the conversation rather than
  being deleted by hand.
- Project saves stay last-write-wins *only when genuinely newer*, so a stale
  copy arriving late from a second device cannot overwrite fresher work.
- Usage events stay idempotent on request ID and route.
- Webhook receipts stay the idempotency guard for Clerk replays.
- `metadata` and `project_data` are now real `jsonb`, so they arrive parsed
  instead of as strings that needed `JSON.parse` with a try/catch around it.

**Verified.** `npm run data:verify` exercises all of the above against the live
database, 12 of 12 passing, using a disposable workspace it removes afterwards.

---

## 2026-08-05 · Decision · Every table has exactly one home

Credits live in Supabase Postgres only. Conversations, projects and usage stay
in MySQL until each is ported, then `mysql.ts` is deleted.

**Why.** No dual writes, no syncing, no question about which copy is right. A
split brain in a billing ledger is unrecoverable.

**Revisit if.** Never for the ledger. The porting order is negotiable.

---

## 2026-08-05 · Decision · The monthly allowance renews lazily

The first touch of a workspace in a new period expires the unused allowance and
grants the current plan's credits. No scheduled job.

**Why.** A cron that fails silently means people do not receive credits they
were promised, and we learn about it from complaints. This cannot fail to run,
because it runs on the path that needs it. The trade-off, that a dormant
workspace refreshes on its next visit rather than at midnight, is invisible.

**Revisit if.** Allowances ever need to be reported on before first use.

---

## 2026-08-05 · Decision · Credits move only when the ledger records the move

The account balance is never updated unless the corresponding ledger row is
written in the same transaction.

**Why.** A grant whose ledger row was skipped by its idempotency key still
topped up the balance, so the audit trail no longer reproduced the balance:
ledger 113, balance 118. Caught by the reconciliation check, not by review.

---

## 2026-08-05 · Decision · The agent is a fixed pipeline, not an autonomous loop

Plan, research each objective, write, check, correct.

**Why.** The shape of research work is known, so fixed stages give predictable
cost and latency and a failing stage is attributable. An open ended agent buys
freedom this task does not need and pays for it in both.

**Revisit if.** Tasks arrive whose shape genuinely cannot be known in advance.

---

## 2026-08-05 · Decision · Agent safety is enforced by the schema

Planning, writing and checking are called with no tools defined at all, rather
than with tools plus a rule not to use them.

**Why.** There is no instruction that can talk a stage into reaching the network
when reaching the network is not a capability it has.

---

## 2026-08-05 · Decision · Plan approval costs one credit, not five

Planning is billed as a chat turn. Approving a plan skips planning entirely.

**Why.** On a five credit monthly free tier, rejecting a bad plan must not cost
most of the allowance.

---

## 2026-08-05 · Decision · Quality is chosen by depth, never by model name

Quick, Standard, Thorough for the agent. Draft, Standard, Premium for media.

**Why.** People do not know what a model name means but do know how much care a
task deserves. It also means swapping a model is a configuration change rather
than a redesign, and it matches the "hide the model zoo" principle.

---

## 2026-08-04 · Decision · Expensive work requires an account

Research, Studio, image and video require a signed-in workspace whenever Clerk
is configured. Quick chat stays open.

**Why.** Anonymous access to media generation is an unbounded bill. Chat is
cheap enough to remain the way people try the product.

---

## 2026-08-04 · Decision · Rate limits key on the workspace, not the address

Signed-in people are limited per workspace. Network address is an anonymous
backstop at half the allowance.

**Why.** Shared campus, office and cafe connections put many genuine users
behind one public address. Address-keyed limits made them throttle each other.

---

## 2026-08-04 · Decision · The credit price is derived, not chosen

One credit may represent GH₵0.26 of landed cost, derived from the Everyday plan
and the 25% cost target.

**Why.** Otherwise nobody can say whether a plan makes money. Recorded in
`PRICING_STRATEGY.md` with the working.

**Superseded 2026-08-08.** Builder and Team exceeded the 25% target at full
utilisation (34.7% and 40.4%). The research-calibrated v3 catalog reduced those
shares to 29.7% and 30.3%; see the newer decision above.
## 2026-08-09 · Decision · Browser evidence is private, short-lived and outside the request process

Read-only visual navigation runs in an isolated Browserbase Function. Next.js
owns policy, durable actions and polling. Supabase Storage owns screenshot
bytes; Postgres owns workspace metadata, integrity hashes and expiry.

**Why.** A browser must survive a dropped customer connection without giving a
web page access to application secrets. Keeping base64 screenshots out of run
rows also avoids database bloat and accidental evidence exposure.

**Revisit if.** The closed pilot clears its safety, recovery and task-success
gates and needs reversible form drafting.

---
