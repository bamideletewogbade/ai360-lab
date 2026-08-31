# Decision and incident log

## 2026-08-31 · Decision · The tab bar and the drawer now arrive together, and "More" is gone

**What was wrong.** The phone tab bar appeared at `max-width: 590px`. The sidebar
stopped being a column and became an off-canvas drawer at `max-width: 820px`.
Every width between those two numbers therefore had neither: no tab bar, and no
visible sidebar. A tablet in portrait (768px) and any large phone held sideways
reached Chats, Projects, Media Studio and Tools & Kits only by finding the menu
button first. The same split existed in JavaScript — the visual-viewport handler
in `src/app/app/page.tsx` tested 590px while the drawer check beside it tested
820px, so the shell also mis-sized itself across that band.

Both now read 820px. There is no width where a primary destination is unreachable
without opening something.

**Why the "More" sheet went.** It held search and recents, Tools & Kits, Library,
Settings, Learn AI360, feedback and account — seven jobs behind one control, with
an active state that lit for two different experiences so it could not say where
you were. Its own first row called `onOpenSidebar`: a door to a door. Search,
recents, settings and help were already in the drawer behind the header's menu
button, so the sheet was mostly a second route to a surface that already existed.
Deleting it removed a focus trap, a dialog and about 340 lines across the
component and the stylesheet.

**The regression it nearly caused.** Only one thing in the sheet was not
duplicated elsewhere: signing in and out. `.auth-sign-up` — "Save your work" — was
already `display: none` on every touch layout, and the header's account controls
were hidden outright below 590px, so the sheet was a guest's only route to either.
Removing it without noticing would have quietly deleted the guest conversion
prompt from every phone. Identity moved back into the header instead, and the
brand wordmark yields the space, since the menu button beside it already says this
is the workspace.

**Order: Chats · Projects · Media · Tools, on both surfaces.** Tools & Kits was
first placed second, on the reasoning that a tools module is where the product is
heading. That was a bet on a module that does not exist yet in its intended form —
today every listing opens a Project engine rather than doing work itself. It
contradicted two things already written down: "Examples are secondary" in
`PRODUCT_EXPERIENCE_ARCHITECTURE.md`, and the 2026-08-20 entry below recording
that this catalogue is a doorway into Projects. A catalogue of starting points
does not outrank the work. Tools still gains what it needed — a permanent labelled
destination one tap away instead of two taps inside an overflow menu.

**Guardrail.** `tests/library-market-ui.test.ts` locks the tab bar and the sidebar
to the same four destinations in the same order, asserts that commented-out items
are not counted as destinations (the previous test matched `<span>Library</span>`
inside a JSX comment and passed while the item was hidden), and asserts that the
media query enabling the tab bar is the same width at which the sidebar becomes a
drawer — the specific gap above.

**Revisit if.** A fifth destination earns primary status. The choice then is five
tabs or a reintroduced overflow menu, and overflow should lose again unless the
fifth thing is genuinely secondary, because that is what put Tools & Kits two taps
deep on a mobile-first product in the first place.

## 2026-08-31 · Decision · Library leaves both navigations, superseding the mobile-probe plan

**What.** Library is now absent from the tab bar as well as the side navigation.
This supersedes the 2026-08-21 entry below, which kept the mobile entry
deliberately while hiding the desktop one. The `apps` experience, its route
handling and `Library.tsx` are still untouched, and the desktop button remains
commented rather than deleted, so restoring it stays cheap.

**Why the previous plan could not have worked.** It kept the mobile entry so that
usage data could decide whether the desktop entry should return. No such data was
ever being collected. `FUNNEL_STEPS` in `src/lib/funnel/contract.ts` ends at
`workspace_entered`, and `selectExperience` records nothing at all, so no event
anywhere distinguishes someone opening Library from someone opening anything else.
The condition the decision was waiting on could never be met, which made the
surviving entry a vestige rather than a probe — and the asymmetry read to anyone
new as an oversight rather than an intention.

**Revisit if.** A concrete Library use case is defined. If that decision wants
evidence behind it, destination selection has to be instrumented first: keeping an
entry alive to watch it is indistinguishable from simply keeping it, until
something actually records the watching.

## 2026-08-26 · Incident · The invitation link could not complete a session

**Found by** an operator asking why the console said "Sent, no reply" when the
flow expects no reply. Tracing the wording led to the mechanism underneath it.

**What was wrong.** `/auth/callback` read only `code`. That is the right and
only parameter for an OAuth round trip, where the browser began the flow and a
PKCE verifier exists to exchange against. An invitation link is not that: it is
minted server-side by `generateLink`, so no verifier was ever created. Supabase's
`/verify` endpoint finishes such a link by handing the session back in the URL
**fragment** — which a server route cannot read, and which the `@supabase/ssr`
browser client does not look for either, since it expects a PKCE `code`.

So the recipient clicked a valid invitation, arrived at
`/app?...&auth_error=callback_failed` **signed out**, and
`claimInvitationOnSignIn` — reachable only from the successful branch — never
ran. Their credits and membership waited on a sign-in that, as far as the
application was concerned, had not happened. The invitation stayed `sent`
forever with nothing anywhere reporting a failure.

**Why it hid.** The one live test appeared to work: the tester landed on the
site, signed in with Google instead, and got an account. The funnel recorded the
whole visit. Only the absent claim gave it away, and that looked like the
separate email-mismatch defect logged below. Two different faults with one
symptom — no credits — is why the first fix did not resolve it.

**The fix.** `generateInviteLink` now also returns `properties.hashed_token`,
and the emailed button points at our own callback carrying
`?token_hash=…&type=invite&next=…` rather than at Supabase's `/verify`. The
callback redeems it with `verifyOtp`, which produces a real server session and
therefore a working claim. `exchangeCodeForSession` is untouched for OAuth.
Supabase's own link remains a fallback if no hashed token comes back, logged so
the weaker path is visible.

**`type` is matched against an allowlist**, not cast. It arrives in a URL anyone
can edit, and passing it through would let a caller name a flow the app never
issues.

**The label that started it.** `sent` means the email left and the person has
not opened their account — not that they owe anyone a reply. It reads "Invited,
not signed up", and a test asserts no rendered copy anywhere says "no reply",
with comments stripped first so the note explaining this history does not trip
its own guard.

**Revisit if.** Supabase changes what `generateLink` returns. The fallback keeps
invitations sending, but silently on the path that does not sign anyone in, so
`admin.invitation_link_fallback` is worth alerting on rather than only logging.

## 2026-08-26 · Decision · At sixty-three people, filtering was never the problem

**Why.** The participant screen carried nine dropdowns, twenty buttons, two
competing 38px counters and eight table columns, over a population that fits on
two screens without any filtering at all. Almost every control existed to narrow
a list that was never too long, while the operator's actual questions were
answered in database vocabulary or not at all.

**What went, and why each one earned it.**

*Eight of the nine filter dropdowns.* Program and Cohort are derived from the
data and hold one value each in this deployment. Contact's protective job — do
not mail someone who unsubscribed — is already done, better, by the email
preview that strips them and shows the exclusions. Activity offered
`active`/`at_risk`/`dormant`, thresholds invisible on screen, when the row
already prints how long ago the person was last active. Signal duplicated the
saved-view buttons one extra click away. What survives is the search box and one
checkbox, **Include people who left**, which was the only thing the Participation
dropdown was genuinely for.

*The "N of M invitations" counter.* Its denominator spanned every status and
never fell, because nothing deletes an invitation row — accept, revoke and
bounce are all status updates. It therefore looked worse the better the pilot
went. The counts moved inside the filter options instead, so
`Awaiting sign-up (12)` answers "who has not replied" without selecting
anything — a question the screen previously could not answer at all.

*Two further restatements of the same number*, and the `View →` column, whose
row was already the click target.

**Renamed, because rows printed the raw enum.** `label()` only swaps
underscores, so a row read `revoked` while the filter above it called that state
"Withdrawn". One vocabulary now — Not sent, Sent no reply, Signed up, Email
bounced, Cancelled — with a fallback for any value, since `invite_status` is
written without runtime validation.

**Three defects fixed in passing.** `inviteNotice` was set in three places and
cleared in none, so a stale "3 sent" read as current an hour later; it is now
dismissible. `selectedInvitations` filtered all invitations rather than visible
ones, so a send could reach rows the current filter hid. And `styles.emailModal`
was referenced but never defined, putting a literal `undefined` in the DOM — a
class of bug TypeScript cannot catch, now pinned by a test that checks every
referenced class exists.

**What was deliberately kept.** The two-step preview on both outbound paths,
every reason field (they are the audit trail the credit ledger renders back),
every capability gate, and per-row `sendAttempts` — a failed send leaves an
invitation `pending` while still counting the attempt, so "never tried" and
"tried three times and keeps failing" both read as Not sent and the count is the
only thing telling them apart.

**Revisit if.** The population outgrows one screen. Filter algebra was removed
because sixty-three rows do not need it; six thousand would.

## 2026-08-26 · Incident · An invitation claimed by exact email left a tester with an empty account

**What happened.** The first real invitation was sent to `bamstewo+t1@gmail.com`.
The recipient clicked it, chose "Continue with Google", and Google returned the
canonical `bamstewo@gmail.com`. `claimInvitationForUser` looked up open
invitations by exact address, found none, and returned null. An account was
created; **no credits were granted and no membership existed.** The console
showed the invitation as `sent` indefinitely, and nothing anywhere reported a
failure.

The funnel is what exposed it. Five rows carried the invitation id and, after
`attachIdentityToVisit` back-filled them, the signed-in account —
`invite_clicked`, `signup_started`, `workspace_entered`, `signup_completed` —
proving this person clicked this invitation and still got nothing. Without that
evidence the symptom is indistinguishable from someone who never opened the
email.

**Why it matters beyond the test.** The `+t1` was an artefact of testing, but
the class is not. Any participant whose invited address differs from the
identity they sign in with hits the same silent failure — and the cohort holds
Yahoo and iCloud addresses whose owners may well tap "Continue with Google".

**The fix, in two halves, because the cases are different.**

*Provably the same mailbox* → resolved automatically. `email-identity.ts`
canonicalises only what a provider documents: Google ignores dots and `+tags`
and treats googlemail.com as gmail.com; a set of named providers document
`+` sub-addressing. Dots stay significant everywhere except Google, because
`john.doe@outlook.com` and `johndoe@outlook.com` are two different people. The
claim keeps its exact-match fast path and falls back to a domain-scoped
candidate lookup, so it stays one small indexed read.

*Genuinely different mailboxes* → never guessed at. No string comparison can
prove `x@yahoo.com` and `y@gmail.com` are one person, and a claim moves credits,
so a false match spends someone else's allowance — silently, which is worse than
the bug being fixed. Two open invitations that canonicalise to one inbox are
likewise refused as ambiguous rather than picked between.

**Detection instead of guessing.** `readInvitationMismatches` joins unclaimed
invitations to funnel rows carrying a user id, which is evidence rather than
inference. It marks each as `sameMailbox` — those heal on the next sign-in — or
not, which needs an operator. `npm run invite:mismatches` reports both.

**Also found and fixed.** `MAX_PER_RUN` was 50 against a 63-person cohort:
"Select all" then Send produced a bare `400 "Review the selected invitations."`
naming no limit. Raised to 75, and an oversized batch now says how many it may
take and how many were selected.

**Revisit if.** An operator needs to re-point an invitation at the address
someone actually used. Today a cross-provider mismatch is resolved by granting
credits and membership by hand, which works but is three steps.

## 2026-08-26 · Decision · The funnel records only what nothing else records

**Why.** `lab_usage_events` begins the moment somebody types a prompt, and the
cohort report begins at their first credit grant. Everything earlier — the
click on an invitation, the landing, the abandoned sign-up — left no trace.

That gap makes the pilot's central number unreadable. If 41 of 63 never
activate, there are three explanations demanding opposite responses: the mail
was never opened (resend it), the sign-up broke (fix a form), or the product did
not convince them (change the product). Only the third is a reason to change
direction and it is the most expensive to act on wrongly, yet all three look
identical — a person simply absent from the cohort report.

**What.** `lab_funnel_events` (migration `0028`) records five steps: invitation
clicked, landing, sign-up started, sign-up completed, workspace entered.

**It stops there deliberately.** First prompt, first outcome, first export and
return visits are *derived* in `readFunnelReport` from `lab_usage_events`, which
has been recording them all along. Duplicating them would create a second
version of a number that can disagree with the first — the same reasoning that
produced the `lab_cost_ledger` view in 0019.

**Attribution is the point at this size.** The invitation link carries its id,
which survives the Supabase round trip through `next=/app?i=…` because
`safeInternalPath` preserves the query string (pinned by a test — losing it
would silently un-attribute the entire cohort). At sixty-three people the payoff
is not statistics: it is that the operator can *phone* the eleven people who
stalled at sign-up. `attachIdentityToVisit` back-fills the anonymous rows at
sign-in, and only rows with no identity yet, so a shared browser cannot rewrite
the first person's history.

**The endpoint is public and treated as forgeable.** It must be — the steps
worth measuring happen before anyone has an account. So: a caller may only name
a step from a fixed list; identity is stamped from the server session, never
read from the body; `signup_completed` and `workspace_entered` are refused
without a real session, which is what stops the funnel being inflated past the
point where it describes actual users; and `unique (visitor_key, step)` means
one visitor writes each step exactly once. It answers 204 to everything,
including its own failures — a tracker that could see errors is one somebody is
tempted to retry, and measurement must never become a reason a page misbehaves.

**Privacy is structural, not a policy.** The parser returns exactly five fields
and drops everything else, so no prompt, name or address can be smuggled in
(pinned by a test). A referrer is reduced to its host because query strings
carry other people's data. DNT and Global Privacy Control are checked before the
body is even read. The visitor key is random and meaningless off this table.

**Verified in a running app**, not only in tests: the invitation id was captured
and stripped from the address bar, both first steps reached the write path, and
the forged step and the account-claiming step without a session never did.

**Revisit if.** Volume grows enough that one row per visitor per step is heavy —
the fix is retention on the table, not sampling, because a sampled funnel cannot
name the individual who stalled.

## 2026-08-26 · Decision · A cumulative programme budget, separate from the daily caps

**Why.** The `pilot-2026-09` cohort grew from 15 to 63 people against a hard
provider budget of US$20 (US$25 at the absolute limit). The daily caps shipped
earlier cannot express that: an application ceiling of $25 a day permits $750 a
month, and the entire pilot budget could be gone in a single afternoon while
every daily cap still reported headroom.

**The arithmetic that drove it.** One credit is US$0.0172 of provider budget, so
the Everyday allowance of 120 credits is $2.07 a head. Sixty-three of those is
**$130 at full utilisation** — six times the budget. Grant-on-reply and partial
utilisation bring the expected figure to roughly $10–20, but an expectation is
not a control. What makes generosity safe is a hard floor under it.

**What.** A fourth scope, `budget`, measured cumulatively from a configured
start date rather than over a UTC day. It reads the same `lab_cost_ledger` and
runs through the same `decideSpend`; only the window differs.

**No default, unlike the daily caps.** An absent daily ceiling takes a built-in
value because every deployment should have a safety rail. A cumulative budget is
a claim about a specific pot of somebody's money, and inventing one would be
guessing at their finances. It is off until set.

**The amount and the date are one setting.** An amount with no start date would
silently sum every dollar ever spent, so a fresh $20 budget would open already
partly consumed by unrelated history. `readSpendCaps` refuses the pair unless
both are present, and `prod:check` treats half-configuration as an error — a
control whose job is to stop spending must never appear set while enforcing
nothing.

**It warns before it bites.** Past 80% consumed, every gated request logs
`spend_cap.budget_nearly_spent` with the remaining dollars, and
`npm run spend:verify` prints a burn bar. A daily cap resets overnight; a
programme budget hits a wall, so the operator needs to see it coming while they
can still top up the provider account or narrow who is still being invited.

**Its refusal never suggests retrying.** Nothing the person did caused it and
nothing they do will clear it, so the message points them at the AI360 team
rather than at a Retry-After they cannot use.

**Revisit if.** A future programme needs per-cohort budgets rather than one
platform-wide pot — the scope would key on `source_id` from the sponsored grant
rather than on a global window.

## 2026-08-26 · Decision · Spend caps are denominated in measured dollars, not credits

**Why.** Gate 3 wanted application, workspace and user spend caps, and the
sponsored-seat work made the gap concrete. Credits bound what one person may
consume and they fail closed, but they cannot bound what AI360 actually pays a
provider. Three ways real spend escapes the credit system: a sponsored cohort
spends credits nobody bought; credit weights are a *model* of cost, so a
provider price rise or a mis-set weight leaves every request legitimately
inside its budget while true spend runs away; and a retrying agent is
individually cheap and collectively ruinous.

**What.** Daily ceilings in US dollars of measured provider cost, checked in
`openCreditGate` before the reservation is taken, so refused work never takes a
hold it must then give back. `projectedUsd` is the request's own ceiling — a
real provider quote when one exists, otherwise the credit ceiling converted
back to dollars — so a cap is a ceiling rather than a tripwire.

**Read the truth, do not mirror it.** Totals come from the `lab_cost_ledger`
view rather than a counter table. A counter would need two correct write paths,
usage events and media jobs, and 0019 exists precisely because summing either
alone gives a wrong answer. A counter that silently misses one path reads as
protection while never firing, which is worse than no cap. The cost is one
indexed range scan per scope; `0027_spend_caps.sql` adds the missing indexes,
and the application-wide figure is cached in process for 30 seconds because a
slightly stale number is entirely adequate for a backstop.

**Unset means capped.** An absent environment variable takes a built-in default
rather than meaning "no limit", so a deployment that forgot to configure a
ceiling still has one, and a malformed value falls back to the default too —
the failure mode of a typo must not be an uncapped bill. A scope is disabled
only by an explicit `off`, which `npm run prod:check` reports as a warning.

**It fails open, deliberately.** If the spend read errors, work proceeds and the
failure is logged. The credit gate immediately after reads the same database and
fails closed, so a Postgres outage still stops authenticated paid work. Letting
a backstop take the product down as well would trade a bounded cost risk for a
total one.

**It lags, deliberately.** Cost is recorded when work completes, so a burst of
simultaneous requests is measured only as each finishes. This is the second
control, not the first: every authenticated request has already passed an atomic
credit reservation. Credits bound each request; this bounds the aggregate.

**Revisit if.** Concurrency rises enough that the burst window matters — the fix
is to add held `lab_credit_reservations` converted through
`usdBudgetForCredits` as a forward-looking term, not to replace the measured
read. Also note anonymous free chat does not pass through `openCreditGate` and
so is not counted; it is bounded instead by the Explorer fair-use cap at roughly
GH₵0.01 a turn.

## 2026-08-26 · Decision · A sponsored seat grants a plan tier, not just a credit balance

**Why.** Preparing the `pilot-2026-09` cohort exposed a gap that would have
made the pilot measure the wrong thing. `credit-repository.resolvePlan` reads
the *subscription* table to decide a workspace's plan. A `sponsored_seat`
credit grant writes only to `lab_credit_accounts` and `lab_credit_ledger` — it
creates no subscription — so a pilot participant holding 120 sponsored credits
was still resolved as **Explorer**, whose fair-use cap is ten chat messages a
day (`CHAT_FAIR_USE_DAILY.explorer`).

Past that cap a signed-in user overflows at 1 credit per message. A curious
participant sending 30–40 messages in their first sitting would have burned
20–30 credits on the cheapest work in the product (~GH₵0.01 landed each),
draining the allowance long before it reached research, agent runs, images or
video. The headline pilot metric — *is 120 credits credible for GH₵125?* —
would have measured chat overflow instead of value delivered.

**What.** `src/lib/billing/sponsored-entitlement.ts` places a workspace on a
real plan tier with no payment, in one transaction: upsert
`lab_subscriptions` under provider `sponsored`, withdraw the outgoing
allowance, grant the plan's included credits, write the ledger row. It
deliberately mirrors the verified activation in
`payments/payment-repository.ts` step for step — same allowance replacement,
same ledger shape — so a sponsored seat and a paid one have the same credit
history and the cohort report reads both without change.

**The two writes cannot be separated.** `allowanceAction` throws
`PAID_ALLOWANCE_STATE_MISMATCH` when an entitled paid plan meets an Explorer
allowance row. Writing the subscription without the allowance in the same
transaction would strand every later request for that workspace behind that
error. `tests/sponsored-entitlement.test.ts` pins this.

**Refusals, in `sponsored-entitlement-policy.ts` so they are testable without
a database.** A sponsored seat is refused when the workspace already has an
active non-sponsored subscription — `resolvePlan` takes whichever active
subscription ends latest, so sponsoring over live paid access could silently
move a paying customer onto a smaller plan. Team is refused because it is an
organization plan whose membership lifecycle is still feature-gated. Access is
bounded: 35 days by default, so it outlasts a four-week pilot without lapsing
during exit interviews, and 120 days maximum.

**Ledger shape is load-bearing.** The grant keeps
`source_type = 'sponsored_seat'` with the cohort as `source_id`, which is
exactly what `admin/cohorts.ts` groups on. Changing either would silently drop
sponsored participants out of the cohort report.

**Revoking does not claw back credits.** `revokeSponsoredEntitlement` cancels
the subscription so the workspace falls back to Explorer on its next touch.
Credits already granted stay: they were given, and taking them back at the end
of a pilot is a hostile way to thank somebody.

**Operator surface.** `npm run credits:pilot -- --entitlement everyday`.
Without the flag the command behaves exactly as before, and the dry run now
says plainly that participants will stay on the Explorer cap.

**Revisit if.** Automatic renewal ever ships. A sponsored subscription is
manually bounded today; a renewal path that does not know the difference
between `sponsored` and `expresspay` providers would try to renew seats no
money is attached to.

## 2026-08-21 · Decision · The document reader also applies to chat, not only project documents

**Why.** A long assistant reply (a report, a structured guide) rendered flat
in chat even after project documents got the collapsible-section treatment
the same day. There was no reason the two surfaces should look different for
the same kind of content.

**What.** `src/app/app/page.tsx`: an assistant message renders through
`DocumentReader` once it has finished streaming; while it is still the
actively-streaming last message (`busy && index === messages.length - 1`) it
stays on the flat `ResponseContent` renderer, because re-splitting into
sections on every delta would reset the accordion and replay the collapse
animation mid-type. A user's own message is never passed through
`DocumentReader`, only `ResponseContent`, so someone's own input is never
reformatted into an accordion.

**The padding scheme had to become context-aware.** `.doc-rail-row`,
`.doc-meta` and `.doc-section` previously hardcoded the project-document
card's `clamp(20px, 4vw, 42px)` inset. A chat message has no padding of its
own to match (`.message-body` sets none; `.response-content` relies entirely
on the surrounding bubble), so that padding now only applies inside
`.project-document`; everywhere else the reader sits flush with the
surrounding message text, matching how a normal reply already looks. Checked
with computed styles in a temporary local preview: 42px padding and 14px text
inside the document card, 0px padding and 16px text inside a chat bubble, and
the rail, lede and section body share the same value within each context so
nothing misaligns against the paragraph text next to it.

**Guardrail.** `DocumentReader` must stay presentation-agnostic: it should
never assume a `.project-document` ancestor, since it now renders in at least
two structurally different containers.

**Revisit if.** Streaming ever needs the rail visible mid-generation (for
example, a very long agent report where jumping ahead while it is still
writing would be useful) — that would need a different signal than
`busy && last message`, since sections would still be arriving.

## 2026-08-21 · Decision · A project document is a rail of collapsible sections, not one long scroll

**Why.** A generated document such as Research findings rendered as one
continuous flow of headings and paragraphs, however long the model wrote it.
The only way to see its shape was to scroll the whole thing, which read as
"a lot of information" rather than a structured piece of work.

**What.** `src/lib/markdown-sections.ts` (`splitMarkdownSections`) splits a
document on its top-level (`##`) headings; anything before the first heading
becomes an untitled lede, always shown. `src/components/DocumentReader.tsx`
renders that lede, a horizontal rail of section pills, and each section as an
independently collapsible block, defaulting to only the first section open.
A document with fewer than two named sections falls back to the plain
`ResponseContent` renderer unchanged, so the rail and accordion chrome never
appear for a short note. `ResponseContent.tsx` was refactored to export a
`MarkdownBody` component (the shared `ReactMarkdown` pipeline: code blocks,
tables, links) so both the flat and sectioned renderers use exactly the same
markdown handling instead of two copies drifting apart.

**Why Motion.** Added the `motion` package (`motion/react`, formerly Framer
Motion) for three things plain CSS handles poorly: animating a section's
height from `0` to `auto` on expand/collapse (CSS cannot transition to
`auto`), a `layoutId`-based sliding highlight behind the active rail pill,
and `onViewportEnter` to drive scroll-spy on the rail as the reader scrolls
past section headers, which works correctly against whatever ancestor
actually owns the scrollbar (`.studio-main`, not the window) because
`IntersectionObserver` accounts for clipping ancestors automatically.

**Why progress is section-based, not pixel-based.** `useScroll`'s pixel
tracking needs the exact scrollable ancestor passed as its `container`
option; that ancestor differs by where the reader is opened and would have
meant threading a ref down through `StudioWorkspace`. Driving the progress
bar from "how many of N sections has the reader reached" instead is simpler,
has no container-detection failure mode, and is arguably the more honest
number for an accordion anyway.

**Guardrail.** `tests/markdown-sections.test.ts` locks the splitting rules: a
heading-looking line inside a fenced code block must never be treated as a
section break, `h1`/`h3` must never split a section (only `##`), and
duplicate heading titles must get distinct ids.

**Revisit if.** A document commonly needs three levels of structure (h2 and
h3 both meaningful enough to collapse independently) rather than two, or the
default "first section open" turns out wrong against how people actually read
these documents.

## 2026-08-21 · Decision · Library stays off the side navigation for now

**Superseded 2026-08-31.** Library left the mobile navigation as well. The
usage data this entry waited on was never being recorded, so the surviving
mobile entry could not have answered the question it was kept for. See the
2026-08-31 entry above.

**What.** The Library entry was removed from the desktop side navigation in
`src/app/app/page.tsx`. The button is commented out, not deleted, and the
`apps` experience, its route handling and `Library.tsx` itself are unchanged.
Mobile navigation still exposes Library.

**Why.** The module is being set aside pending a clearer use case rather than
expanded on. Keeping the code in place, only hidden, means it can be restored
without rebuilding it once that use case is defined.

**Revisit if.** A concrete Library use case is defined, or usage data on the
mobile entry point suggests the desktop entry should return.

## 2026-08-20 · Decision · Discovery renamed from Market to Tools & Kits

**Why.** "Market" reads as a storefront. Nothing on the page is bought or
sold: every listing opens a working Project engine directly. The name
promised commerce that does not exist yet, and commerce is a separate, later
idea (reviewed creator-made agents, prompt packs and tools), so "Market" is
reserved for that instead of spent on the current catalogue.

**What.** `src/lib/market-catalog.ts` (`MARKET_PRODUCTS`) now organises 17
listings by job rather than by category: study and school, career, create and
business. Every listing maps to one of 11 project engines (`packId`) that
already run end to end, verified by counting distinct `packId` values against
`MARKET_PRODUCTS.length`. The UI component and its filters
(`src/components/Market.tsx`, `src/lib/library-filter.ts`) kept their internal
names; only the surfaced label and framing changed.

**Guardrail.** A listing must resolve to a real engine before it is added to
the catalogue. `tests/market-catalog.test.ts` asserts every product's pack
exists and produces at least one deliverable, so a decorative or dead-end
listing fails the suite.

**Revisit if.** A genuine creator-commerce layer is built. At that point
"Market" becomes available again for the thing it originally implied.

## 2026-08-20 · Decision · Brand Kit: workspace-wide knowledge, and a logo that does not require colours

**Why.** A workspace's brand voice and facts are true across every
conversation, not one project, so scoping brand knowledge to a project would
mean re-entering the same context repeatedly. Separately, the original
brand-kit table required both `primary_color` and `accent_color`; a workspace
that only had a logo and no defined colours was an invalid row, which was
never actually true of how people set up a brand.

**What.** Migration `0021_brand_knowledge_and_logo.sql` adds
`lab_brand_knowledge`, keyed by `workspace_key` (not project), with the same
row-level-security shape as `lab_project_files`. A workspace's logo is stored
as an ordinary `lab_assets` row (`asset_kind = 'upload'`, the same private
bucket every generated file already uses) and referenced from
`lab_brand_kits.logo_asset_id`, a plain column rather than a declared foreign
key, matching how `lab_media_outputs.asset_id` already works. `primary_color`
and `accent_color` on `lab_brand_kits` are now nullable: the existing
hex-format check constraints already tolerated a null value (a check
constraint only rejects a value that evaluates to false, and
`null ~* pattern` evaluates to null), so relaxing `NOT NULL` needed no
constraint rewrite. `src/lib/brand-knowledge.ts`,
`src/app/api/brand-kit/knowledge/route.ts` and
`src/app/api/brand-kit/logo/route.ts` are new; `src/lib/export/brand.ts` and
`src/lib/export/render.ts` apply knowledge, logo and colours to generated
documents, with `src/lib/export/image-dimensions.ts` reading a logo's real
pixel dimensions from its PNG or JPEG header so it embeds at the right aspect
ratio without an image library.

**Guardrail.** Brand identity belongs to the workspace, never to one
conversation or project. A document generated next week must still reflect
the same organisation without the person re-entering anything.

**Revisit if.** A workspace needs more than one brand identity (for example, a
Team workspace representing multiple client brands). That is a materially
different data shape and should not be retrofitted onto the current
one-kit-per-workspace table.

## 2026-08-20 · Decision · Chat verifies time-sensitive answers instead of routing them into Research

**Why.** Before this change, any question that looked research-shaped,
including a short current-facts question such as a date, a price or a
schedule, routed into the same metered, multi-source Research workflow used
for genuine investigations. The two needs are different: a short lookup
belongs inside an ordinary reply, and a paid multi-source workflow should be
reserved for requests that actually ask for one.

**What.** `src/lib/context-engineering.ts` adds `freshnessForPrompt`, which
classifies a prompt into `off`, `auto` or `required` based on whether it
depends on mutable real-world facts (prices, laws, current officeholders,
availability, schedules) versus whether it explicitly asks for research,
comparison or cited sources. `policyForConversation` now keeps
`liveInformation` (whether search tools are offered at all) separate from
`deepResearch` (whether the metered Research workflow is entered), and
`src/app/api/chat/route.ts` bills only `deepResearch` against the credit gate.
A `required` freshness answer is buffered: the reply is not streamed to the
browser until at least one supporting source is found, and if none is found
the person is told the claim could not be verified rather than being shown an
unverified answer. The chat stream gained a `grounding` event (`checking`,
`verified`, `not_needed`, `unavailable`) and the UI shows a receipt line under
the answer, either "Checked against current sources" with a date or a flag
that sources could not be verified, so the check is visible to the person, not
only in server logs.

**Guardrail.** A required-freshness claim must never reach the browser
unverified. `outcome` is recorded as `success_degraded` whenever
`groundingUnavailable` is true, so an unverifiable answer is countable, not
silent.

**Revisit if.** The freshness classifier over- or under-triggers in practice
(either routing ordinary conversation into buffered mode, or letting a
genuinely mutable claim through as `auto` without a check) once there is
enough live traffic to judge it against.

## 2026-08-20 · Fix · Two small closes: a reopened spend-data grant, and a missing index

**What.** Migration `0022_cost_ledger_privileges.sql` revokes
`lab_cost_ledger` from `anon` and `authenticated` explicitly. Migration `0019`
had already revoked it from `public`, but Supabase grants its own
browser-facing roles separate default privileges that a `public` revoke does
not touch, so the ledger stayed reachable. The same migration adds an index on
`lab_brand_knowledge.owner_id`, a cascading foreign key that Postgres does not
index automatically; without it, deleting a user would have scanned the
entire knowledge table while holding locks. Separately, `AuthProvider.tsx` no
longer calls `router.refresh()` on every Supabase auth state change.

**Why.** Spend data is an operator-only concern and should never be reachable
from a browser role, however the migration sequence revoked access. A missing
index on a foreign key is a performance and lock-contention risk that only
shows up under real data volume, so it is worth closing before the table has
enough rows to make it expensive to add.

**Guardrail.** A `REVOKE ... FROM public` is not sufficient on Supabase;
browser roles (`anon`, `authenticated`) need their own explicit revoke when a
table must be operator-only.

## 2026-08-19 · Decision · Every video tier now survives a Veo outage

**Why.** Draft, Standard and Premium were all secretly the same vendor —
`google/veo-3.1-lite`, `-fast` and the full model. A tier "falling back within
its own list" only ever meant falling back to another Veo variant
(`VIDEO_TIER_PREFERENCES`'s own doc comment said so). One Google outage, price
change or catalogue removal would have taken every tier down at once, not just
degraded one of them.

**What was checked before touching anything.** The two vendors first proposed
(Flux 3, Seedance 2.5) do not actually work today, verified against the live
`https://openrouter.ai/api/v1/videos/models` catalogue rather than public
pricing pages, which turned out to disagree with it:

- `black-forest-labs/flux-3-video` cannot appear at all — its shortest clip is
  5 seconds and `STUDIO_CLIP` is fixed at 4. `supportsFormat` correctly
  excludes it; no format flexibility exists to work around this without
  changing the Studio clip length itself, which is published in the credit
  guide and marketing copy.
- `bytedance/seedance-2.5` looked like a $0.1028/s per-second price on public
  pricing blogs. The live catalogue exposes only a token-priced sku
  (`video_tokens`), the same unquotable shape as Seedance 2.0 before it. It
  would need its own real measured-clip generation and a `MEASURED_CLIP_USD`
  entry before it could be quoted — not done here, because that costs real
  money and deserves its own deliberate step, not a side effect of a
  reliability fix.

**What did check out.** `kwaivgi/kling-v3.0-std` and `-pro` both fit the exact
Studio clip (4s, 720p, 9:16) with real per-second pricing, verified the same
way: $0.336 and $0.448 per clip against a $0.8272 budget at the current
48-credit video ceiling — Std undercuts `veo-3.1-fast` ($0.32) by a hair and
comfortably beats the old assumption that the ceiling was 24 credits (it
is not, `FEATURE_WEIGHTS.video.ceiling` is 48; the "24" in the 2026-08-17
entry was a since-superseded value). Pro is cheaper than the current Premium
default (`veo-3.1` at $0.80). `alibaba/wan-2.7` ($0.40) and `runway/gen-4.5`
($0.48) also priced and fit that day — documented as the next candidates
rather than added, so each new vendor enters production one at a time and can
be watched.

**What changed.** Every tier gained a Kling fallback, ordered after the
existing Google default so today's default behaviour and quality bar are
unchanged:

```
draft:    veo-3.1-lite   → kling-v3.0-std
standard: veo-3.1-fast   → kling-v3.0-std → veo-3.1-lite
premium:  veo-3.1        → kling-v3.0-pro → veo-3.1-fast
```

**Guardrail, and it is now a test, not just this paragraph.**
`tests/video-catalogue.test.ts` asserts every tier's preference list names
more than one provider, and separately simulates a Google-only outage (a
catalogue containing only Kling) and confirms all three tiers still resolve.
A future edit that quietly strips the fallback back to Google-only fails the
suite instead of waiting for a real outage to notice.

**Revisit if.** `npm run media:verify`'s next run shows Kling's price moved
enough to threaten the ceiling, or a production render surfaces a quality gap
between Kling and Veo worth knowing about before Kling becomes a primary
choice rather than a fallback.

## 2026-08-17 · Decision · The type scale was built a quarter too small

**Why.** The product looked better at 125% browser zoom, and the reason was
measurable rather than a matter of taste. On the landing page at 1280px, **76 of
166 text elements sat below 12px**, the smallest at **7px**, with body copy at
**15px**. Across all fifteen stylesheets, **432 of 883 `font-size` declarations
were under 12px**. Browser zoom multiplied everything into a legible band; the
CSS had simply been authored a quarter too small.

**What.** A codemod raised every `font-size` on a curve — heaviest at the small
end where the problem was, almost nothing for display sizes already large:

| Original | Factor |
| --- | --- |
| under 10px | ×1.32 |
| 10–11px | ×1.26 |
| 12–15px | ×1.16 |
| 16–23px | ×1.09 |
| 24px and up | ×1.03 |

with a hard floor of 12px. Body copy is now 17px. `clamp()` sizes had every
term scaled, viewport units included, so fluid headings keep their curve.

**Only `font-size` was touched.** Spacing, padding and layout geometry are
untouched, which is why this cannot reflow a grid or introduce overflow — it is
a typographic correction, not a zoom. Verified at 375, 768, 1024, 1280 and
1440px across the landing, pricing, how-it-works, what-you-can-make, terms,
changelog and the workspace: no text under 12px anywhere, no horizontal
overflow, no clipped text, and the workspace composer at 17px so iOS no longer
zooms on focus.

**Line length followed.** Larger text shortens the measure, which fixed most of
it; three places still ran long and are now capped — the hero guest note (90
characters at tablet width), the pricing footnote (94) and the workflow caption
(88). The two fixed in `ch` rather than pixels, so the measure tracks the type
size from here on.

**Wording.** The free allowance was described six ways across four pages ("Five
free every month", "5 free credits monthly", "Get 5 credits every month", "Five
credits a month, free, no card", "the five free credits"). It now comes from
`FREE_MONTHLY_CREDITS`, derived from the Explorer plan. How-it-works also still
promised "Try it without an account" without qualification; it now says what is
true — asking and learning work as a guest, research and Studio need a free
account.

**Revisit if.** The remaining half of the 125% effect is spacing, which zoom also
scaled. That carries real layout risk and was deliberately left for its own pass.

## 2026-08-17 · Decision · Pilot language is gone from anything a customer is charged under

**Why.** Checkout is open, ExpressPay is live and a real payment has been taken,
but the paid surfaces still described a private trial: "One-month pilot access",
"Join the Everyday pilot", "Request Team pilot", "no automatic renewal *during
the pilot*". Asking someone for GH₵125 while calling it a pilot invites the fair
question of whether the product is finished — and two statements had gone from
cautious to simply untrue.

**What changed.** The word is gone from the pricing page, checkout, the
low-credit email, the assistant's own product-knowledge block and the terms. The
constraints behind it are unchanged and still stated plainly, because they are
real: one month per payment, nothing renews automatically, no annual billing
yet, Team onboarding is assisted. "Pay one month at a time" says the same thing
without implying the product is provisional.

**Two corrections in the terms**, which had drifted into being wrong rather than
merely cautious: prices were described as "a pilot proposal until checkout is
activated" (checkout is activated), and "one-time top-ups are not sold during
the first pilot" (they are sold, from the credit page).

**Left alone deliberately.** The closed read-only browser pilot is a genuine
unlaunched pilot, and the changelog's "Pilot" release status is a feature
maturity label. Neither is billing language.

**Also.** `CHAT_FAIR_USE_DAILY` and the top-up sizes are now read from the
catalogue in the product-knowledge block too — the assistant was quoting its own
hand-typed copy of both, which is the product itself misquoting the price.

## 2026-08-17 · Decision · The page is "Pricing", the things on it are "plans"

**Why.** The navigation said "Plans", the URL was `/pricing`, the metadata title
said "AI plans and pricing", and the page itself sold plans, top-ups, per-task
credit costs, payment methods and refund terms. Three names for one page, and
the softest of them under-described most of its content. Someone scanning a
navigation bar for what something costs looks for "pricing".

**What.** The nav and footer label is now "Pricing". The route stays `/pricing`
— sitemaps, emails and search results already point at it, and renaming a live
URL to fix a label is the expensive way round. "Plan" remains the right word for
the products on the page: Everyday plan, "Choose Builder".

**Also fixed: every published number now comes from the engine that charges it.**
The page was quoting figures typed by hand — example task costs (2/4/6 credits,
of which two were already wrong against `FEATURE_WEIGHTS`), the wallet
illustration, the top-up sizes, and the daily chat caps. `CHAT_FAIR_USE_DAILY`
moved out of the chat route into the catalogue so the enforced cap and the
published cap are one value. The free plan's button now uses the shared
`StartCta`, so a signed-in visitor is no longer told to "start free" again.

**Guardrail.** A pricing page may not hold its own copy of a price. If a number
is shown to a customer, it is read from the module that charges them — this is
the third time drifted constants have surfaced this week.

## 2026-08-17 · Decision · The landing page promises only what a visitor can actually have

**Why.** Walking the homepage as a signed-out visitor: click starter 02 "Make a
decision", click "Take the first step", and the first thing AI360 ever says is
an error card with a reference UUID — `POST /api/agent → 401`, "Sign in to use
this." Three of the four hero starters did this, and four of the six outcome
cards, because `agent` and `studio` are expensive scopes that require an
account. That guard is right. The copy above it was not: "Start free, no card"
in the hero and "Try it without an account" on How-it-works.

**What changed.**

- **The free doors lead.** Starters are ordered chat first, and anything behind
  the account carries a "Free account" badge *before* it is clicked. The guest
  note now says what is true: free to try with no account, and an account is
  needed to keep work and to use research and Studio.
- **One CTA component owns the verb.** Eight hand-written labels pointed at
  `/app` — "Take the first step", "Start with your goal", "Start with a goal",
  "Start now", "Try it now", "Open AI360", "Open workspace", "Continue as a
  guest". `StartCta` now decides label, destination and the send-or-prefill
  behaviour in one place: "Start free" signed out, "Open workspace" signed in.
- **The empty button does something.** Clicking it with an empty box used to
  open an empty box somewhere else. It now reads "Show me an example" and runs a
  real question on the free chat path, so a visitor sees the product work in
  seconds without an account.
- **Pre-written words no longer submit as a goal.** A starter drops in an
  opening like "Research my options … for: "; submitting it untouched sent a
  dangling half-question. The rule is now consistent site-wide: **what the
  person typed runs, what we pre-wrote waits in the box.** The button says
  "Finish the sentence" and returns focus instead of navigating.

**Guardrail.** A call to action is a promise about the next screen. "Take the
first step" is only honest when the next thing that happens is a first step —
so gating and copy are one decision, never two.

**Found on the way, not fixed.** Every marketing page is served with a second,
hidden copy of itself inside React's streaming container (`<div hidden
id="S:0">`) — on production, two `main.landing-shell`, duplicate `#landing-goal`
ids and 12 outcome cards instead of 6, about 17.7KB of the 66KB document. It is
systemic rather than landing-specific and deserves its own investigation.

## 2026-08-17 · Decision · Studio is a workspace, and video has two honest prices

**Why.** Two problems, one surface. The studio opened on a full-bleed autoplaying
hero with the prompt below the fold and the person's own work behind a third
tab — marketing furniture inside a workspace, and expensive on a phone on a
metered connection. Separately, an audit against live provider prices
(`scripts/audit-media-pricing.mjs`) found the pricing was profitable but not
fair: every render silently used the standard engine at ~19 credits when a
draft engine at ~7 credits of cost was already in the catalogue and never
offered.

**What changed in the studio.**

- **Composer first, work always visible.** One prompt box with a mode switch
  (Image / Video); the person's own output sits beside it on desktop and below
  it on a phone. No tab to navigate to see what you just made. The hero is gone.
- **Controls that name the destination.** Shapes read "Status, TikTok",
  "Instagram, Jiji", "YouTube, Facebook", "Flyer, print" — not bare ratios —
  and video can now be rendered 9:16, which is where most of this work is
  actually posted. Starters are a market product shot, a food plate, a shop
  front, a brand pattern and a poster background, because those are the jobs
  people here are paying to get done.
- **Mobile is the primary case.** Single column, a sticky action bar above the
  safe-area inset, horizontally scrollable starters, 44px tap targets, 16px
  prompt text so iOS does not zoom, and no autoplaying video under data-saver.
- **The price is on screen.** Balance and per-feature cost come from
  `/api/credits`, so the studio never hardcodes a number the credit engine
  could drift away from.

**What changed in pricing.**

- **A quote decides the hold.** `estimateCredits` used to hold
  `max(published reserve, quoted)`, so a 7-credit draft clip still reserved 16
  and charged 12 — the cheap engine cost nearly what the dear one did. With a
  real quote, the quote and the feature floor are the only inputs.
- **Video floor 12 → 6, ceiling 20 → 24.** The floor was set for the dearest
  engine. The ceiling sets the model budget, and at 20 credits the standard
  engine sat 7% under it — one small provider price rise from being unsellable.
  At 24 it has 23% headroom. Published guidance moves to "6 to 24 credits".
- **Two tiers offered, not three.** Draft and standard are real choices. The
  premium engine costs $0.80 a clip against a $0.41 ceiling, so offering it
  would only produce a refusal at the moment of confirming.
- **Cost telemetry was inflated ~50×.** The status poll recorded the provider's
  running job cost on every check: 150 polls of three renders read as $47.80 of
  spend against about $0.96 of real cost. Only a terminal status records it now,
  and only once. This is the number pricing decisions are made from.

**Economics, measured.** A credit costs GH₵0.26 landed and sells for GH₵0.86
(Team) to GH₵1.25 (smallest top-up) — 70–79% gross margin, and every paid plan
stays inside the 25% AI-cost target at full utilisation. An image costs
$0.019–$0.034 (2 credits of cost) and charges 3. A draft clip costs $0.12 (7)
and now charges about 7; a standard clip costs $0.32 (19) and charges 19.
Margin comes from the plan markup, not from marking up the render.

**Guardrail.** If a cheaper engine exists and the interface never offers it,
the pricing is not fair however healthy the margin is. And a usage figure that
a poll can write more than once is not a cost figure.

## 2026-08-17 · Incident · Private media storage was never configured in production

**Symptom.** Video renders completed at the provider — the clip existed and was
billable on OpenRouter — but Media Studio stayed on "Rendering your motion
video…" indefinitely. Reported as "videos generate on OpenRouter but it's stuck
rendering in prod".

**Root cause.** `SUPABASE_SECRET_KEY` and/or `SUPABASE_PRIVATE_BUCKET` were
never set in the Hostinger runtime, so `persistGeneratedMedia` threw *Private
media storage is not configured.* on every delivery. `lab_assets` was empty:
**no generated media had ever been stored in production.** The status handler
treats a failed delivery as transient, keeps the job `running` and returns a
502, so the client backed off and polled forever — the correct behaviour for a
passing fault, applied to a permanent one.

Three things hid it:

1. **Images appeared to work.** `/api/studio/image` falls back to a base64 data
   URL when storage fails, so the only visible casualty was video.
2. **The real error was never on the job.** Video recorded the generic "could
   not be saved yet; the next poll retries delivery", so the cause was only in
   host logs. Image jobs recorded the true message — which is how it was found.
3. **`/api/ready` reported ready.** Readiness checked auth, database, gateway
   and payments, but never the bucket the paid deliverable is stored in.

**Fix.**

- **A missing configuration is terminal.** `MediaStorageNotConfiguredError` is
  typed, and delivery that fails on it — or that is still failing 30 minutes
  after the provider finished — marks the job `failed`, refunds the whole hold
  and tells the person, instead of polling forever.
- **Video records the real reason** on the job, as image already did.
- **Settlement can no longer break a poll.** `settleReservation` in the status
  path was unguarded; a throw there turned every later poll into a 500 the
  client retried forever, so even a delivered clip could read as "Rendering…".
- **`/api/ready` now has a `media_storage` check**, required in production.
- **`scripts/diagnose-video-jobs.mjs`** (durable jobs, holds, provider status,
  bucket write probe) and **`scripts/diagnose-video-delivery.mjs`** (replays the
  download → upload → rows path against a stuck job, rolling back by default)
  make the failing stage visible in one command.

**Guardrail.** If a deliverable only exists once it is stored, storage is a
required readiness check, not an assumption. A retry loop must be able to tell a
fault that will pass from a fault that will not, and a fallback that hides a
broken dependency on one surface (image data URLs) will let it ship broken on
every other.

**Still to do.** Set `SUPABASE_SECRET_KEY` and `SUPABASE_PRIVATE_BUCKET`
(`ai360-private`) in hPanel and redeploy — the code fix ends the endless spinner
but only the environment fix makes renders deliverable. Two 2026-08-15 video
jobs were settled at 19 credits each with no stored output and are owed either
delivery or a refund.

## 2026-08-16 · Decision · Observability: Sentry for errors/traces, Axiom for logs

**Why.** Logs were readable only in Hostinger's runtime viewer — no field
search, no retention, no alerting — and client-side browser errors were
invisible entirely (the stuck-video 502s were only caught when a screenshot was
shared). The structured JSON logging, request IDs and redaction were already
right; the missing pieces were a searchable log store, error tracking with
stack traces, browser capture and alerting.

**What.** Two SaaS destinations on free tiers, both fed from the existing
pipeline so nothing changes at call sites:

- **Sentry** (`@sentry/nextjs` 10.70.0): server init in `sentry.server.config.ts`
  registered via Next 16 `instrumentation.ts` (`register` +
  `onRequestError = Sentry.captureRequestError` for unhandled errors); browser
  init in `instrumentation-client.ts` (errors + performance traces, **no
  session replay**). Every `log.error(...)` is bridged to a Sentry issue with
  the same requestId/route/event via `src/lib/error-tracking.ts`, so handled
  failures (provider 502s, settlement mismatches) are traceable too.
- **Axiom** (`src/lib/log-sink.ts`): batched, fire-and-forget NDJSON shipping of
  the same structured lines — console output remains the source of truth and is
  always written.

**Privacy.** Non-negotiable and enforced twice: fields are scrubbed by the
existing `safeValue` before they reach Axiom/Sentry, and Sentry's `beforeSend`
(`src/lib/sentry-redact.ts`) drops prompt/content/payment/authorization-shaped
fields and scrubs secrets again. `sendDefaultPii: false`,
`dataCollection: { userInfo: false, httpBodies: [] }`, session replay off.

**Guardrails.** Telemetry never blocks a request and never throws (the sink
drops a batch rather than fail the app; Sentry is inert without a DSN). Both
destinations are additive — unset env vars mean the app behaves exactly as
before. Source-map upload and the Sentry tunnel are deferred until the
DSN/token provisioning step.

**Revisit if.** Free-tier volume is exhausted (Sentry ~5K errors/mo) — add
sampling or alert only on spikes; if a second service appears, move the
video/payment lifecycles onto a shared traceId before adopting OpenTelemetry.

**Next step.** Provision a Sentry project + Axiom dataset, put the env vars in
Hostinger, then verify one browser error, one server 5xx and one Axiom log line
appear.

## 2026-08-16 · Incident · A stuck video render locked the whole studio

**Symptom.** In production, a video render never completed: the studio showed
"Rendering your motion video…" indefinitely, the render button stuck on
"Rendering…", and — the worse part — **no other media action worked**, not even
image generation. The browser console showed repeated
`POST /api/studio/video 502`.

**Root causes.**

1. **One job locked everything (the blocking bug).** `busy = generating ||
Boolean(videoJob)` disabled the image button, the gallery and every other
   studio action whenever a video job existed — while the banner said "You can
   keep working". The copy was a lie the code enforced.
2. **Polling give-up left a dead job behind.** After `MAX_CONSECUTIVE_ERRORS`
   transient failures, the poll stopped scheduling without clearing the job, so
   the lock and the "Rendering…" banner persisted forever even though nothing
   was being watched anymore.
3. **The 502s themselves were provider-side** (the status poll to OpenRouter
   failing); the exact provider response was only visible in logs
   (`studio.video.status_failed`), not in the UI.

**Fix.**

- **A video render never locks the studio.** Only the video render button is
  gated by an in-flight job; images, the gallery and tab switching stay fully
  usable. The banner now says what is true: "Images and the rest of the studio
  stay fully usable while it renders."
- **Polling never strands a render.** After a long failure streak the job is
  kept and polling slows to one check every five minutes (instead of giving
  up), with a single honest notice that credits are safe; the 2-hour
  reservation TTL remains the backstop. A "Stop waiting" button lets the
  person give up watching without touching the durable server job.
- **The gallery is the person's real media.** `/api/studio/media?recent=1`
  returns the most recent completed jobs with stored outputs, and Media Studio
  loads them on mount, so a finished clip survives a refresh or appears after
  the studio was closed. Demo items stay behind real work as inspiration.
- **Delivery is more resilient.** If the provider's `/content?index=0`
  download fails, the status handler now falls back to the signed URLs the
  provider returns on completion before declaring delivery failed.
- **Diagnosable 502s.** The video route now includes the provider's message in
  502 bodies (visible in the long-outage notice and in logs).
- **8s disabled.** The 8-second option is commented out while 4-second render
  reliability is validated end to end in production.

**Guardrail.** A background render is a promise, not a lock: a client surface
must never disable unrelated work because one job is pending, and a poll loop
that gives up must clear the state it owns. If a render is stuck, the person
should be able to keep working, know their credits are safe, and stop watching
when they want.

**To confirm in prod.** Re-run a 4s render and verify the clip lands in the
gallery while image generation works at the same time; check
`studio.video.status_failed` logs (now carrying the provider message) to see
what the 502 was actually saying; then re-enable 8s once a few 4s renders pass.

## 2026-08-15 · Incident · Video render charged credits without delivering a clip

**Symptom.** In production, a video render took credits (the balance dropped)
but never produced a clip — twice, on the same test account. Image generation
worked; video did not. Reported as "video took user credits while the action was
not completed".

**What actually happens today.** Video is a hold-and-settle flow, not a charge
at click time: submitting reserves credits (video holds are sized from the
quoted provider price, up to the reserve) and the render is charged or refunded
only when a status poll sees the job reach a terminal state. So "credits taken"
means the hold moved out of `available`, and it stays out until one of these
happens: a poll settles it (charge or refund), the reservation's 2-hour TTL
expires and the next balance read reclaims it, or the job is marked failed.

**Root causes found in review.**

1. **Settlement ran before delivery.** The `status` handler settled the
   reservation as soon as the provider reported `completed` — and only then
   downloaded the file and persisted it. A download or storage failure after
   that point left the person charged with no clip, and the client showed a
   generic error and stopped.
2. **The client gave up on any transient error.** One failed poll (network
   blip, provider 502, throttled timer in a background tab) permanently stopped
   polling, orphaning the job until the TTL reclaimed the hold.
3. **Refresh/navigation orphaned the job.** `token`/`jobId` lived only in
   component state; a refresh killed the poll chain with no way to resume it.
4. **Unrecognised terminal statuses.** The provider can also report `cancelled`
   and `expired`; both are terminal but were treated as "keep polling". A 404
   from the provider's status endpoint (job lost) was likewise returned as a
   transient 502 the client retried forever.

**Fix.**

- **Settle only after delivery.** A `completed` clip is charged only once the
  file has actually downloaded and been persisted to storage. If delivery
  fails, the job stays `running` and the next poll retries it; the reservation
  TTL remains the backstop. Failed renders refund the whole hold.
- **Client polling is resilient.** Transient failures (5xx, network) retry with
  exponential backoff capped at 2 minutes instead of giving up; terminal
  statuses (`failed`/`cancelled`/`expired`, including in an error body) stop
  and refund. The job survives refresh — token, job id, prompt and duration are
  kept in session storage and re-hydrated on mount, and a `visibilitychange`
  poll resumes immediately when the tab returns (mobile browsers throttle
  timers in background tabs).
- **Server reconciliation.** `cancelled` and `expired` are now terminal
  failures that refund. A provider 404 (job lost) is treated as terminal
  too — the durable job is marked failed and the hold is refunded with a clear
  message instead of being retried forever.
- **Manual credits for testing.** `scripts/grant-credits.mjs` grants credits to
  a named account for non-payment testing, idempotently, as an `adjustment`
  ledger entry that never touches the monthly allowance.

**Guardrail.** A hold is a promise, not a charge. Work that finishes in a later
request must charge only after the deliverable is actually stored, and a client
that polls must never be allowed to lose the job on a transient error. Where a
provider can end a job without `completed`, every such status is terminal and
refunds.

**To confirm in prod.** Re-run a full video render (quote → confirm → wait for
poll) and verify the clip lands in the gallery and the balance settles to the
measured cost; then deliberately close the tab mid-render, reopen the studio
and confirm the render resumes. The 2026-08-15 run that consumed credits
without output should also be checked in `lab_credit_reservations`/ledger for
that workspace — if the 2-hour TTL passed, the hold was already reclaimed.

## 2026-08-15 · Incident · Media Studio showed fake assets instead of generating

**Symptom.** In production, clicking Generate in Media Studio did not generate
anything — it added a static placeholder image to the gallery and switched to
the Asset Gallery tab. Reported as "it just navigates to the assets column".

**Root cause.** `MediaStudio` was a demo shell, not a wired feature. It posted a
body the real studio APIs do not accept (raw `prompt`/`aspectRatio`/`style` to
routes that expect an approved creative direction with brand context), never
checked `response.ok`, read a `data.url` field the APIs do not return, and fell
back to static files (`/media-hero-art.jpg`, `/media-motion-frame.jpg`) so every
attempt "succeeded" — then switched to the gallery tab, which is exactly the
navigation the user saw. The production generation machinery (credit gates,
provider loops, durable jobs, storage) was already working; the surface simply
never called it correctly.

**Fix.**

- `/api/studio/image` and `/api/studio/video` now accept a raw-prompt mode
  (a `prompt` field) that passes the person's own words through with only light
  art-direction/execution guardrails, reusing the same credit gate, provider
  loop, durable job and storage paths as the branded Studio flow. Branded mode
  is unchanged.
- Media Studio now calls those APIs honestly: it checks `response.ok`, reads
  the real `image` / `downloadUrl` fields, and shows the actual error (sign-in
  required, not enough credits with a top-up hint, provider failure) instead of
  fabricating success.
- Video follows the production quote-first pattern: click renders → it fetches
  the live quote → shows the price in credits → the person confirms → submit →
  poll every 20s → the finished clip appears in the gallery. Failed renders
  return credits and say so.
- Removed the unsupported 4:3 aspect ratio and relabeled clip durations to the
  supported 4s/8s; demo gallery items are now labelled "Example" rather than
  "Today".

**Guardrail.** A client surface that ignores `response.ok` and falls back to
static files is a demo, and demos must not live inside the paid product. Any
surface that triggers paid work must surface the real error, and its request
must be validated against the route it calls. The "navigates to assets" report
was the visible symptom of a fabricated success path.

**Verified.** The studio routes were already exercised live end to end for the
branded flow (2026-08-07 run). The raw-prompt paths reuse the same machinery;
re-run an image and a video generation from Media Studio in production before
declaring this closed.

## 2026-08-15 · Decision · The "need credits" moment offers both a top-up and a plan

The insufficient-credits 402 in Media Studio used to show only a toast pointing
at Settings. The moment a person hits the credits wall is exactly when they are
willing to pay, so the surface now shows an inline panel with both ways to
continue, side by side: the quick top-up bundles (GH₵50 → 40, GH₵100 → 90,
GH₵200 → 185) for this one render, and the paid monthly plans (Everyday,
Builder, Team) for regular use, each linking straight into its checkout.

**Why both, and why in that order.** A top-up is the MoMo-sized answer to
"I just need this one image or clip", and the overflow mechanic is useless to
someone at zero credits without one. But a plan is the better deal per credit
and the healthier relationship for us, so the panel is honest about it (top-ups
cost more per credit — enforced by `tests/pricing-economics.test.ts`) and the
plans are labelled as such. This mirrors the frontier pattern of offering the
quick purchase and the subscription at the same friction point.

**Implementation.** `/api/credits` now returns a compact public `plans` list
(slug, name, price, included credits, featured — never internal economics), and
Media Studio renders the panel on any 402 from image, video quote or video
submit, keeping the video quote visible so the person can confirm again once
topped up. Prices come from the API, never hardcoded in the component. The
panel dismisses; the 402 toast remains as the lightweight companion message.

**Revisit if.** The panel measurably cannibalises Everyday signups (top-ups
should be the occasional convenience, not the default), or if analytics show
people topping up when a plan would have served them better.

## 2026-08-15 · Decision · One-time credit top-ups are back on the table, and now shipped

The 2026-08-08 decision deferred top-ups to prove one purchase shape first
(renewal, reversal, refund). Monthly checkout is now live in production and a
real purchase has succeeded, so the reason to defer no longer holds. A top-up
reuses the exact ExpressPay hosted checkout, query verification and one-time
manual payment — no new money-path risk.

**Why it makes sense now.**

- It completes the overflow mechanic: "1 credit per extra message" dead-ended
  at zero credits (wait for tomorrow, or pay GH₵125 for a whole month). A
  GH₵50/40-credit bundle is the natural MoMo-sized answer at the moment a
  person is engaged.
- It gives free Explorer users a paid on-ramp: today they cannot do any paid
  work without committing to a full month.
- It cannot cannibalize plans: every top-up costs more per credit than the
  Everyday plan (GH₵1.25 / 1.11 / 1.08 vs GH₵1.04), enforced by
  `tests/pricing-economics.test.ts`. Hoarding top-ups is a worse deal than
  subscribing, so the economics self-correct.

**Implementation.** Checkout accepts exactly one item — a plan or a top-up
(`checkoutRequestSchema`); top-up attempts store `cadence = 'one_time'` with
`metadata.itemType = 'topup'`; `applyVerifiedPayment` branches so a verified
payment adds purchased credits (ledger `top_up` entry) and touches neither the
subscription nor the monthly allowance; the catalogue is the source of truth
for credits and price at activation, not the attempt metadata. No migration
needed: `cadence` already allowed `one_time`, `metadata` is jsonb, and the
ledger already had `top_up`. Settings shows a "Buy more credits" section
(40/90/185), the checkout page shows a one-time review with an honest
"a plan is better value" note, and receipts name the bundle.

**Guardrails.** Top-ups never renew and never extend access; purchased credits
are permanent (they survive the monthly allowance reset by construction). The
same amount/currency/reference verification and idempotent activation apply as
for plans. A top-up a person did not recognise is reconciled from the ledger
like any other payment.

**Revisit if.** Pilot data shows top-up volume cannibalising Everyday
subscriptions despite the per-credit premium, or the bundles need rebalancing
against what people actually buy.

## 2026-08-15 · Decision · Past the daily cap, chat overflows at a flat 1 credit per message

The "included chat" fair-use cap from the earlier decision today was a hard
stop: pass it and you were blocked until the window reset, even if you were a
paying user willing to pay per message. This decision makes the transition from
free to paid seamless and closes the three leaks in the first shape.

**What changed.**

- **Metered chat bypasses the daily cap.** Live research, files and premium
  models are already paid for by the credit gate, so the free-chat allowance
  never limits them. Previously the cap ran before the gate and cut off paying
  users doing paid work — the biggest fairness bug in the first shape.
- **Signed-in users past the cap pay a flat 1 credit per extra message**
  (`chat.overflow`, floor/reserve/ceiling all 1) instead of being blocked. A
  typical turn costs ~GH₵0.01 against GH₵0.26 of credit value, and the cap
  absorbs normal use, so overflow is rare and the margin is comfortable. An
  unusually long turn is still capped at the 1-credit reservation; the ledger
  keeps recording the real measured cost so overage stays visible.
- **Anonymous callers stay hard-stopped** with a sign-in hint: they have no
  credit account to overflow onto, so paying per message is not available to
  them.
- **The daily counter is durable.** `lab_chat_daily_counters` (migration 0017) is keyed by workspace/IP and UTC date, so a deploy cannot reset the
  allowance and a second server instance cannot double it, and "resets at
  midnight UTC" is now literally true. When the billing database is down, the
  route falls back to the in-memory daily bucket so chat never fails; the
  12/min burst limit still applies.
- The guide and pricing copy now say "extra chat after your daily limit: 1
  credit each", and the product-knowledge block tells the AI the caps and the
  overflow price.

**Economics.** The 10/60/120/150 caps bound free cost to ~GH₵3/18/36/45 per
fully-used workspace per month (13%/10%/4% of plan revenue for the paid
plans), and overflow billing converts post-cap usage into the highest-margin
work in the product. Both directions stay profitable.

**Guardrails.** Overflow is metered, never free — a user without credits gets
the same 402 as any other paid feature. The minute bucket still bounds bursts.
`AI360_RATE_CHAT_PER_DAY` remains an operator override.

**Revisit if.** Pilot data shows overflow volume or long-turn costs that make
the flat credit mispriced, or the caps themselves need rebalancing against
observed median daily use.

## 2026-08-15 · Decision · Everyday chat is included; credits meter the heavy work

Everyday chat on the fast model (AI-Auto / GPT) no longer draws from the credit
meter. Live web research, attached files, deliberately premium models (Claude
Sonnet 5, Kimi K3), agent execution, images and video stay metered.

**Why.** A typical chat turn costs ~GH₵0.01 landed, which converted to exactly
one credit because of the one-credit floor — so pricing felt static ("every
message costs 1 credit") regardless of the work done, and 120 Everyday credits
read as only ~120 short messages. Frontier products converged on the opposite
shape: Perplexity meters only its multi-step Computer, ChatGPT/Claude meter
with soft caps, and Cursor bills actual tokens with premium-model multipliers.
The measurement plumbing (per-request tokens and cost, measured settlement)
already existed; the floor was doing the pricing.

**Implementation.**

- `FEATURE_WEIGHTS.chat` is `0/0/0` and the chat route skips the credit gate
  for plain chat entirely. Cost is bounded by a plan-aware fair-use daily cap
  (Explorer 10, Everyday 60, Builder 120, Team 150; anonymous halves to 10)
  enforced by the existing rate limiter, with a "resets at midnight UTC"
  message instead of a credit denial. **Superseded 2026-08-15:** the cap moved
  to a durable Postgres counter, metered work bypasses it, and signed-in users
  pay a flat 1 credit per extra message instead of being blocked — see the
  newer decision above.
- `chat.premium` (floor 1, reserve 4, ceiling 8) meters explicitly selected
  premium models at measured cost × 2 (`PREMIUM_MODEL_MULTIPLIER`), the
  Cursor/Copilot "premium models consume credits faster" pattern. The
  settlement still records the real measured amount in the ledger.
- Agent plan approval is now free: planning is one small chat turn, and
  rejecting a plan should cost nothing. Execution keeps the agent reservation.
  This supersedes the 2026-08-05 "plan approval costs one credit" decision;
  its intent (rejecting a plan must not cost most of the allowance) is served
  better by free.
- The AI can now answer questions about AI360 itself: `src/lib/product-knowledge.ts`
  appends a compact public-facts block (features, plans, prices, credits,
  languages, payment, honest limits) to the chat and agent system prompts.
  Public facts only; a test guards against leaking internal economics.
- `CREDIT_GUIDE`, the pricing page and What you can make advertise "everyday
  chat is included" instead of "1 credit".

**Guardrails.** Plain chat remains bounded: rate limits plus per-plan daily
caps, and the premium set is deliberately only `claude`/`kimi` — `gemini` stays
included as the default vision model; add it to `isPremiumChatMode` if live
data shows it being run at abusive volume. Heavy-feature floors are unchanged
in this step; rebalancing them to measured cost is the next phase.

**Revisit if.** Pilot data shows chat abuse beyond the caps, the premium
multiplier looks mispriced against real Claude/Kimi usage, or the fair-use caps
(10/60/120/150) turn out wrong against observed median daily use.

## 2026-08-14 · Decision · ExpressPay owns phone collection

AI360's checkout form no longer asks for a phone number. The customer reviews the
plan and payment method, then continues to ExpressPay, which collects the Mobile
Money number on its own payment page.

**Why.** The number was collected twice: once on AI360's form, once on
ExpressPay's hosted checkout, with no pre-fill between them. AI360 never stored
the number (no table or migration column), never used it for reconciliation
(matching is by order, token, amount and GHS) and ExpressPay's Merchant API
lists `phonenumber` as optional. Removing the field removes the double entry,
keeps card payers from being asked for a number at all, and stops AI360
collecting personal data it does not use. Extends the 2026-08-08 ExpressPay
decision: the provider owns the payment form, so it owns phone collection too.

**Revisit if.** ExpressPay's checkout stops collecting the phone reliably, a
provider requires a phone from the merchant at creation time, or AI360 needs the
number for support and reconciliation — it would then be stored deliberately,
with its own retention and privacy terms.

## 2026-08-10 · Incident · Chat displayed raw JSON and leaked model reasoning

**Symptom.** A real first-time user (Leo) received an answer rendered as a raw
JSON string, `{"type":"text","text":"Hello Leo..."}`, instead of formatted
prose. Other runs of the same prompt returned the model's private planning
("Thinking Process: 1. Analyze the user...") as the whole answer, or stopped
mid-sentence on the token limit.

**Root cause.** Every failing response was served by `qwen/qwen3.7-plus`. Under
`sort: 'price'` in the provider preferences, OpenRouter ignored the primary
model that leads each fallback chain and served the cheapest one instead, which
was Qwen. Qwen through OpenRouter returned its content as a raw JSON envelope,
leaked reasoning as content, and ignored the reasoning token cap. The primary
`openai/gpt-5.6-luna` was clean in every test. Qwen was also 2.3x the primary's
price per turn, so as a fallback it was neither cheaper nor more reliable.

**Fixes.**

1. Removed `sort: 'price'`. The `models` array is already ordered primary-first,
   so honouring that order serves the intended model instead of the cheapest.
2. Removed the `preferred_max_latency` and `preferred_min_throughput` hints from
   the no-tools branch. They steered chat to `gemini-3.5-flash-lite` (about 3x
   the primary's price) because the primary's endpoint did not meet them. First
   content still streams in 1.5 to 2.5 seconds without them.
3. Replaced the fallback backstop `qwen/qwen3.7-plus` with
   `google/gemini-3.5-flash-lite`, which is cheaper, supports structured outputs
   and produced clean output in every test.
4. Added `src/lib/provider-content.ts` as the one place that normalizes provider
   content: it flattens string, array-of-parts and single-part shapes, drops
   reasoning parts, and recovers a complete JSON envelope. The chat route and the
   agent both use it now instead of each hand-reading `delta.content`.
5. Added `reasoning: { exclude: true }` so a thinking model cannot spend the
   whole budget narrating and return nothing. Defence in depth now that the
   flaky model is gone.
6. The chat route now records the model that actually served the request rather
   than the one requested, and marks truncated or reasoning-leaked answers as
   `success_degraded` so the fault is countable.

**Verified.** 184 unit tests pass. Live against the running server: Leo's exact
prompt returned clean formatted Markdown 6 of 6 times, every one served by
`gpt-5.6-luna` at about GHS 0.01 per turn.

**Guardrail.** `sort: 'price'` over a fallback chain silently substitutes the
model. If cost routing is wanted again, express it by ordering the chain, not by
a sort that can pick a model whose output quality was never checked. New models
must be probed for output shape before entering a chain; the primary was clean
and the fallback was not, and only a live check showed the difference.

## 2026-08-10 · Incident · Database tooling failed on an unencoded `@` in the password

**Symptom.** Since 2026-08-08, `npm run db:postgres:verify` and
`npm run db:migrate` both failed with `28P01 password authentication failed for
user "postgres"`. The 2026-08-08 audit recorded the cause as the Supabase direct
host resolving AAAA only, and concluded the checks could not run from an
IPv4-only environment.

**Actual cause.** That diagnosis was wrong. The database password contains a
literal `@`, which must be percent-encoded as `%40` inside a connection URL and
was not. `.env.local` also declared `DATABASE_URL` and `DIRECT_URL` twice each,
and the second `DIRECT_URL` carried an accidental extra `@`.

**Why it stayed hidden.** The `postgres` client splits user information at the
last `@`, so `DATABASE_URL` happened to recover the correct password and the
application never broke. Only `DIRECT_URL`, which the scripts prefer, was
corrupted by the extra character. A failure confined to the tooling reads as an
environment problem rather than a configuration one.

**Fix.** Percent-encoded the password in both URLs and removed the shadowed
duplicate declarations, leaving a single session-pooler pair. Verified: 30
tables, row-level security on every one, zero grants to the `anon` role, 10
migrations applied. `npm run credits:verify` 16/16 and `npm run data:verify`
12/12 pass against the live database.

**Guardrail.** A connection string is a URL, so any reserved character in a
password has to be percent-encoded. Prefer reproducing the actual error over
reasoning about a plausible cause: the IPv6 explanation was coherent, written
down, and stopped anyone looking further for two days.

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

| Sent alongside tools                                               | Result                   |
| ------------------------------------------------------------------ | ------------------------ |
| no provider block                                                  | 200                      |
| `preferred_max_latency`                                            | 200                      |
| `require_parameters`                                               | 404, matches no provider |
| `sort`, `allow_fallbacks`, `preferred_min_throughput`, `max_price` | 500 each                 |

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

| Pack            | Specialists                                                 | Time |    Cost | Of reserved budget |
| --------------- | ----------------------------------------------------------- | ---: | ------: | -----------------: |
| Name and domain | Namer, then Domains                                         |  22s | $0.0098 |                19% |
| Marketing pack  | Researcher, Campaign, then Copywriter and Calendar together |  43s | $0.0544 |                39% |

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

| Path             |    Time |       Cost | Result                                |
| ---------------- | ------: | ---------: | ------------------------------------- |
| Chat             |    7.4s | negligible | answers                               |
| Chat in Twi      |       - | negligible | replied in Twi to an English question |
| Research agent   |   17.4s |    $0.0063 | 67 streamed chunks, 4 sources         |
| Image            |   15.1s |    $0.0026 | 1.6 MB image returned                 |
| Video quote      | instant |          - | $0.12 quoted before anything ran      |
| Video generation |     79s |    $0.1200 | clip completed, download ready        |

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

| Pack             | For                                  | Credits |
| ---------------- | ------------------------------------ | ------: |
| Brand and launch | No brand yet                         |       8 |
| Marketing pack   | Brand exists, needs a push           |       8 |
| Ads generator    | About to spend on ads                |       5 |
| Name and domain  | Stuck on what to call it             |       3 |
| Pitch pack       | Approaching a funder or big customer |       7 |
| Content calendar | Runs out of things to say            |       5 |

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

| Shape                                                   | Example              | Handled      |
| ------------------------------------------------------- | -------------------- | ------------ |
| `duration_seconds_*`, dollars per second                | Veo, Kling, MiniMax  | yes          |
| `cents_per_second_output` plus a minimum per generation | Runway               | yes          |
| `video_tokens`, dollars per generated token             | Seedance, Sora, Grok | **excluded** |
| nothing usable published                                | several              | excluded     |

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

- The stream is now only a _view_ of the run. Writing to a closed connection is
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
reply in the one they wrote in". English _is_ a different language, so an
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
- Borrowing English words inside a local sentence is instructed as _correct_.
  Accra speaks that way, and inventing an unfamiliar word for "invoice" would
  serve people worse.
- Research findings stay in the source language. Only the plan and the final
  answer are translated, because translating evidence early loses accuracy.
- Ga and Ewe carry extra guidance to keep sentences short and concrete, because
  model support for them is thinner than for Twi.

**Not established.** That the output is _good_. The checks prove the system
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
- Project saves stay last-write-wins _only when genuinely newer_, so a stale
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
