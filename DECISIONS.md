# Decision and incident log

Choices that would otherwise be re-argued, and faults that must never be
rediscovered. Newest first. Each entry records what was decided, why, and what
would have to change for the decision to be revisited.

The team-facing version of this, with the measured numbers and the layer by
layer architecture, is the Technical Workbook.

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

**Known breach.** Builder and Team exceed the 25% target at full utilisation
(34.7% and 40.4%). A test pins this so it cannot drift further unnoticed. The
position needs a deliberate decision.
