# AI 360 Lab implementation roadmap

Last updated: 2026-08-01

This is the living delivery checklist for shared AI 360 identity, organization-ready workspaces, durable projects, and bounded multi-agent execution. Update the checkboxes and status table as work is completed.

## Product outcome

AI 360 Lab should help an individual or team move from an outcome to a reviewed deliverable through a visible, controlled process:

`brief -> plan -> delegated work -> verification -> human approval -> production -> reusable assets`

## Architecture decisions

- [x] Reuse the existing AI 360 Clerk application for `aithreesixty.tech` and `lab.aithreesixty.tech`.
- [x] Keep personal accounts available. Organization membership must be optional.
- [x] Treat Clerk Organizations as team or customer workspaces, not as the AI 360 Lab product boundary.
- [x] Keep the existing AI 360 Organization for internal staff and pilot administration.
- [x] Start with Clerk's `org:admin` and `org:member` roles.
- [x] Keep the agent runtime model-independent. Kimi K3 can be a coordinator option, not a permanent hard dependency.
- [x] Use bounded orchestration before attempting a large swarm.
- [x] Require human approval before paid media generation or external side effects.
- [x] Measure an agent by the completed outcome, not by a convincing final message.

## Current baseline

- [x] Public landing page and outcome-led onboarding.
- [x] Chat, Agent and Studio experiences.
- [x] Live web research and source citations.
- [x] File, image, video and voice inputs.
- [x] Image and video production with cost approval.
- [x] PDF and Word exports.
- [x] Optional Clerk integration scaffold.
- [x] MySQL users, conversations, messages, projects and usage schema scaffold.
- [x] Local conversation persistence and signed-in conversation synchronization.
- [x] Request logging, request IDs, size limits and basic rate limits.
- [x] Production build and live-provider release-candidate test.
- [ ] Production Clerk keys configured.
- [ ] Production MySQL connection configured and migrated.
- [ ] Studio projects synchronized across devices.
- [ ] Durable usage events and database-backed quotas.
- [ ] Real multi-agent orchestration.

## Delivery status

| Phase | Outcome | Status | Gate |
| --- | --- | --- | --- |
| 0 | Decisions and baseline | Complete | Architecture approved |
| 1 | Shared identity and tenant isolation | Next | Cross-site sign-in and isolation tests pass |
| 2 | Durable projects, assets and usage | Planned | Work survives browser and server restarts |
| 3 | Coordinator and specialist runtime | Planned | Three-agent pilot beats single-agent baseline |
| 4 | Live agent-room experience | Planned | UI reflects real persisted events |
| 5 | Evals, security and cost controls | Planned | Release thresholds pass |
| 6 | Pilot rollout and subscriptions | Planned | Reliable usage and entitlement data exists |

## Phase 1: Shared identity and organization-ready tenancy

Why: every conversation, campaign, generated file, agent run and cost must have a secure owner before collaboration or subscriptions are introduced.

### Clerk dashboard, user-owned actions

- [ ] Confirm both sites use the same Clerk production application and instance.
- [ ] Set Organization membership to **optional**.
- [ ] Keep automatic first-Organization creation disabled.
- [ ] Keep public user-created Organizations disabled during the pilot.
- [ ] Keep the internal AI 360 Organization at a limited membership size.
- [ ] Confirm `aithreesixty.tech` and `lab.aithreesixty.tech` are accepted production origins/domains.
- [ ] Add the existing Clerk production keys to Hostinger environment variables. Never paste secret keys into source control or chat.

### Application work

- [x] Introduce one server-side auth context containing `userId`, `orgId`, `orgRole` and the resolved workspace key.
- [x] Resolve personal workspaces as `user:<userId>`.
- [x] Resolve team workspaces as `org:<orgId>`.
- [x] Derive organization context from Clerk on the server. Never accept trusted ownership from the browser.
- [x] Add workspace ownership to projects, conversations, messages and usage while retaining creator IDs.
- [x] Add an organization switcher behind a `team_workspaces` feature flag.
- [x] Add Clerk webhook handling for user, organization and membership lifecycle events.
- [x] Make webhook processing idempotent and verify webhook signatures.
- [ ] Add 401 tests for unauthenticated protected operations.
- [ ] Add 403 tests for authenticated users outside the requested workspace.
- [ ] Add tenant-isolation tests proving one organization cannot read or mutate another organization's records.

### Phase 1 acceptance gate

- [ ] An existing AI 360 learner can open Lab with the same identity.
- [ ] A personal user can save and resume work.
- [ ] An organization member can switch into a team workspace.
- [ ] Personal and organization records remain isolated.
- [ ] Removing a membership removes access without deleting the organization's work.

## Phase 2: Durable projects, assets and usage

Why: the product cannot charge for work or promise execution if campaigns, generated media and cost records can disappear after a restart.

- [x] Add protected Studio project read and upsert endpoints scoped to the active Clerk workspace.
- [x] Complete the safe Studio lifecycle with protected archive and restore operations. Permanent deletion remains intentionally unavailable.
- [x] Autosave Studio intake, strategy, text assets and approvals. Generated-media metadata remains pending.
- [x] Add optimistic concurrency using the project updated-at token.
- [x] Keep local drafts for guests and temporary offline recovery.
- [x] Add an explicit local-to-account import flow after sign-in while retaining the guest copy as recovery.
- [x] Add a responsive project dashboard with save state, last edited time and asset progress.
- [ ] Add explicit creator and current-workspace labels to project cards.
- [x] Add project archive and recovery without destructive deletion.
- [ ] Select an S3-compatible object store for brand guides, generated images, videos and exports.
- [ ] Store file metadata and ownership in MySQL. Do not store large media binaries in MySQL.
- [ ] Use short-lived signed download URLs for private assets.
- [x] Write `lab_usage_events` for chat, Agent, Studio, voice, image, video and export requests.
- [x] Record model, tokens, actual or estimated cost, latency, outcome and request ID.
- [ ] Replace process-memory daily quotas with durable user/workspace quotas.
- [ ] Retain a short burst limiter at the application edge for immediate abuse protection.

### Phase 2 acceptance gate

- [ ] A project survives browser clearing, sign-out, sign-in and server restart.
- [ ] Generated assets remain downloadable according to retention policy.
- [ ] Every paid provider call has an owner, request ID, outcome and cost record.
- [ ] Duplicate retries do not create duplicate charges or records.

## Phase 3: Bounded coordinator and specialists

Why: delegation should improve completeness and speed only when a task can genuinely be divided. It must not become expensive theatre.

### Runtime contracts

- [ ] Define versioned schemas for `AgentPlan`, `AgentTask`, `AgentResult`, `Evidence`, `Verification` and `AgentEvent`.
- [ ] Represent task dependencies as a directed acyclic graph.
- [ ] Give every specialist a clear objective, boundaries, tools, required evidence and output schema.
- [ ] Standardize agents and tools behind one callable interface.
- [ ] Preserve complete provider tool-call messages in internal run state where the provider contract requires it.
- [ ] Store only safe summaries and user-visible outputs in the presentation layer.

### Coordinator policy

- [ ] Classify tasks as simple, focused, complex or batch.
- [ ] Use one agent for simple tasks.
- [ ] Use two specialists for focused comparisons or research.
- [ ] Use three to five specialists for complex campaigns or business plans.
- [ ] Set maximum delegation depth to one for the first release.
- [ ] Prevent specialists from spawning additional specialists.
- [ ] Set run-level cost, token, time and tool-call budgets.
- [ ] Allow one verifier-triggered replan cycle.
- [ ] Stop early when the success criteria are satisfied.
- [ ] Cancel outstanding work when the user cancels a run.

### First specialist team

- [ ] Researcher: current evidence, source quality and citations.
- [ ] Strategist: positioning, decisions, trade-offs and practical plan.
- [ ] Verifier: completeness, contradictions, evidence and user constraints.
- [ ] Add Brand specialist after the three-agent pilot passes.
- [ ] Add Copy specialist after brand-aware evaluation exists.
- [ ] Add Production specialist after durable asset storage exists.

### Execution infrastructure

- [ ] Add `agent_runs`, `agent_tasks`, `agent_events`, `agent_artifacts` and `agent_approvals` tables.
- [ ] Generate idempotency keys for runs and paid actions.
- [ ] Use bounded parallel execution for independent DAG nodes.
- [ ] Persist state transitions before publishing UI events.
- [ ] Choose a durable queue/worker mechanism before enabling long background runs.
- [ ] Support retry only for safe, idempotent operations.
- [ ] Add explicit states: queued, planning, running, verifying, awaiting approval, completed, failed, cancelled.
- [ ] Keep provider adapters replaceable so Kimi, Claude, Gemini or GPT can fill any role.

### Phase 3 acceptance gate

- [ ] A three-agent campaign task completes after a browser refresh.
- [ ] Parallel tasks run concurrently when dependencies allow it.
- [ ] The verifier can identify a gap and trigger one bounded replan.
- [ ] The final result cites the contributing artifacts and evidence.
- [ ] The system never exceeds the configured run budget.
- [ ] The three-agent pilot beats the single-agent baseline on the agreed evaluation set.

## Phase 4: Live agent-room experience

Why: users should understand what is happening, what it costs and when their input is required without exposing private model reasoning.

- [ ] Replace timed simulated stages with persisted runtime events.
- [ ] Show the coordinator creating a plan.
- [ ] Show specialists beginning, handing off and completing bounded tasks.
- [ ] Show dependencies and which work is running in parallel.
- [ ] Display meaningful status summaries, not hidden chain-of-thought.
- [ ] Show elapsed time, budget consumed and estimated remaining work.
- [ ] Allow a user to cancel a run.
- [ ] Pause cleanly for clarification or approval.
- [ ] Resume after approval, reconnect or refresh.
- [ ] Show the verifier's checklist and pass, revise or blocked outcome.
- [ ] Link final deliverables back to the tasks that produced them.

## Phase 5: Evaluation, safety and operations

Why: adding more agents multiplies possible failures, costs and misleading claims. Quality must be measured before scale.

- [ ] Create at least 20 representative AI 360 tasks across research, campaigns, documents and production.
- [ ] Define task-specific success criteria before running each evaluation.
- [ ] Grade factuality, citation support, completeness, usefulness and brand alignment.
- [ ] Verify real environment outcomes for actions, not merely the final text claim.
- [ ] Run multiple trials for non-deterministic tasks.
- [ ] Compare single-agent and multi-agent quality, cost and latency.
- [ ] Add regression thresholds for deployment.
- [ ] Trace every run, task, provider call, tool call, retry and approval.
- [ ] Redact secrets and sensitive user material from operational logs.
- [ ] Add prompt-injection defenses around web pages and uploaded files.
- [ ] Give specialists the minimum tools and data required for their task.
- [ ] Add provider circuit breakers and fallback rules.
- [ ] Add an internal dashboard for failures, spend, latency and completion rate.

## Phase 6: Pilot rollout and subscriptions

Why: subscriptions should be based on measured cost and reliable entitlements, not guesses.

- [ ] Run the coordinator behind a feature flag with AI 360 staff first.
- [ ] Pilot with a small set of learners and businesses.
- [ ] Collect structured feedback at the end of completed projects.
- [ ] Define free and paid limits using observed usage data.
- [ ] Decide whether billing is individual, organization-based or hybrid.
- [ ] Add plan and feature entitlements.
- [ ] Add credit reservations for expensive media jobs.
- [ ] Reconcile reserved and actual provider cost after completion or failure.
- [ ] Add spend caps at user, organization and application levels.
- [ ] Publish clear retention, privacy, cancellation and refund rules before charging.

## First implementation slice

The first code slice should be small enough to verify independently:

- [x] Add the shared `AuthContext` and workspace-key resolver.
- [x] Add the workspace ownership migration without removing existing owner fields.
- [x] Update conversation access to use the resolved workspace.
- [x] Namespace browser conversation storage by the active personal or organization workspace.
- [x] Add unit tests for personal, organization and cross-workspace scope resolution.
- [ ] Add tenant-isolation integration tests.
- [ ] Configure Clerk production settings and Hostinger variables.
- [ ] Run cross-site sign-in, personal workspace and organization workspace tests.

Only after this passes should Studio persistence and the coordinator runtime be built on top of it.

## Inputs required from the project owner

- [ ] Confirm Organization membership is set to optional in Clerk.
- [ ] Confirm whether the Organization in the screenshot should be named `AI 360 Internal`.
- [ ] Add production Clerk keys directly to Hostinger.
- [ ] Provide or configure the dedicated Hostinger MySQL database credentials.
- [ ] Choose an object-storage provider before durable media work begins.
- [ ] Approve the first three specialist roles: Researcher, Strategist and Verifier.

## Change log

| Date | Decision or milestone | Evidence |
| --- | --- | --- |
| 2026-08-01 | Shared Clerk application selected | Existing learners need one identity across the main site and Lab |
| 2026-08-01 | Optional Organization membership selected | AI 360 serves both individuals and teams |
| 2026-08-01 | Bounded coordinator selected | Better cost control, observability and evaluation than an immediate large swarm |
| 2026-08-01 | First specialist team selected | Researcher, Strategist and Verifier cover evidence, decisions and quality control |
| 2026-08-01 | Workspace ownership foundation implemented | Server-derived personal and organization keys now scope conversation persistence |

## Definition of done

A phase is complete only when:

- [ ] Its acceptance gate passes in a production-like environment.
- [ ] Automated tests cover its critical ownership and failure paths.
- [ ] Logs expose enough information to diagnose a failed run without exposing secrets.
- [ ] User-facing errors include a request reference.
- [ ] Documentation and environment examples are current.
- [ ] Cost and latency are measured.
- [ ] The result has been reviewed on desktop and mobile.
