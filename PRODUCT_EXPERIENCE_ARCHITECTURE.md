# AI360 product experience architecture

Updated: 2026-08-09

## The product promise

AI360 turns an ordinary-language goal into useful work a person can understand,
review and put to use. The interface should make the work feel simpler than the
technology behind it.

This gives every product decision one test:

> Does this help a person move from a goal to a trustworthy, usable outcome?

If a control does not help them state the goal, understand the work, make a
decision, review a consequence, or use the result, it should not be in the
primary interface.

## One journey, capability when needed

The customer sees one conversational workspace. The system chooses the minimum
capability that can deliver the requested outcome.

| Customer need | System behavior | Persistent object |
| --- | --- | --- | --- |
| Help me now | Answer directly inside the conversation | Conversation |
| Investigate this properly | Turn on sourced research and a checked run | Conversation plus research run |
| Help me move lasting work forward | Offer or open a durable project | Project with conversations and deliverables |

The visible loop is:

```text
Goal -> Plan or brief -> Work -> Review -> Use -> Improve
```

Each request uses only the part of the loop it needs:

```text
Direct help  Goal -> Answer -> Refine
Research     Goal -> Plan -> Find and compare -> Check -> Deliver
Project      Conversation -> Brief -> Build -> Review -> Continue
```

This is the product expression of loop engineering. The engineering system may
plan, call tools, evaluate and correct. The interface uses ordinary words,
shows progress, pauses before consequential actions and always gives the person
a way to change direction.

## Navigation decisions and why

### One entry, not three modes

Ask is the normal interaction and needs no label. Research is selected
automatically when current evidence is necessary; its depth and plan controls
appear only after that route is active. Create is an outcome, not a mode.

### No model picker in the primary navigation

Customers should choose the kind and depth of help. AI360 should route to the
right capability. Provider names add cognitive load, expose an implementation
detail and weaken the AI360 promise. An expert override can later live in an
advanced setting, supported by evidence that customers need it.

### Projects are durable context

A conversation does not become a project when the system changes routes. A
project has a longer life and owns a brief, business context, sources,
decisions, assets, approvals, iterations and exports. The sidebar separates
Chats and Projects.

### New work starts blank

New chat opens a blank conversational surface. New project opens a blank project
conversation. Neither requires a template or knowledge of internal routing.

### Examples are secondary

Templates and outcome examples help people who are stuck, but never block the
blank start. The campaign example remains evidence of quality below the primary
project action.

## What Create means now

Create is a guided business project workspace. It is not a general-purpose
blank canvas and it is not only a one-time asset generator.

A Create project should contain:

1. Goal and structured brief
2. Business and audience context
3. Sources and assumptions
4. Proposed direction and quoted cost
5. Generated and uploaded assets
6. Review comments and approvals
7. Versions, exports and next actions

The interface supports six project types from one registry: brand and launch,
marketing, ads, naming and domains, pitch, and content calendar. The chosen
type controls the promise, price, intake copy, specialists, stages and final
deliverables. Older saved campaign projects remain compatible.

### Implemented Create architecture

```text
Project
  -> project type from the pack registry
  -> intake schema for that type
  -> shared project context
  -> staged coordinator
       -> specialists that may run in parallel
       -> evaluator and correction pass
  -> normalized deliverables
  -> review and approval state
  -> versioned project assets
```

The durable project records its pack metadata and run result. Intake and stages
come from the pack registry. Specialist sections become a common deliverable
model with review state and version history. A deterministic evaluator checks
minimum usefulness, placeholders, document structure and source links. At most
one bounded correction pass runs for up to two failing sections, and only while
the original reserved budget and deadline still have room.

Model upgrades can now improve specialists behind stable pack, event and
deliverable interfaces instead of forcing a redesign of the product.

### Remaining production boundary

The pack runs to completion if the browser disconnects, but its final result is
not yet recoverable through a run identifier. Before calling Create fully
production-ready, persist pack runs and their streamed events like Research
runs, then let the project reconnect and resume after a lost connection.

Image and PDF brand guides are also not sent into this specialist workflow yet.
The interface accepts text brand notes only and says so explicitly rather than
silently ignoring an attachment.

## Why bounded loops fit AI360

Current agent research consistently recommends starting with the simplest
system that works, keeping people in control and adding autonomy only where it
creates measurable value. AI360 therefore uses bounded, inspectable workflows
for known business outcomes. It should not become an unrestricted do-anything
agent.

The product needs:

- visible plan or brief before expensive work;
- cost and consequence shown before approval;
- progress that survives a lost connection;
- sources and assumptions attached to decisions;
- evaluation against the requested outcome, not only fluent text;
- a clear recovery path when a tool or model fails;
- a human handoff for safety, payment or high-impact ambiguity.

## Ghana and African product context

The regional opportunity is not a smaller copy of a US AI workspace. GSMA
reports 416 million mobile internet users in Africa, while a large usage gap
remains because of affordability and digital skills. Ghana Statistical Service
research also finds that micro and small firms lag larger firms in digital
adoption, while marketing and customer relations are the most requested area
for digital improvement.

That changes the product priorities:

- mobile-first layouts and touch targets;
- low-data pages, compressed media and no decorative autoplay;
- resumable work so a dropped connection does not lose a paid run;
- one reusable business brief instead of repeatedly typing context;
- plain language, voice input and useful local-language support;
- outputs for WhatsApp, social posts, flyers, pitches and sales follow-up;
- cost in credits and local currency before work starts;
- clear approval and Mobile Money friendly payment journeys;
- downloadable and shareable outputs that work outside AI360.

## Evaluation plan

The modes are successful only if people complete useful work.

| Area | Primary measure | Guardrail |
| --- | --- | --- |
| Navigation | Time to choose the right mode | Mode switching and immediate exits |
| Ask | Useful-answer rate | Regeneration and correction rate |
| Research | Accepted deliverable rate | Source errors and abandoned runs |
| Create | Projects reaching an approved asset | Cost, failed runs and time to first asset |
| Continuity | Returning projects continued | Repeated context entry |
| Trust | Approval after viewing plan or brief | Reports, refunds and unsafe actions |

Every shipped workflow needs a small benchmark set containing real Ghanaian and
African business tasks, plus global comparison tasks. Evaluate completion,
factual support, local relevance, cost, latency and customer usefulness.

## Research basis

- [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic, Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [IBM, What is loop engineering?](https://www.ibm.com/think/topics/loop-engineering)
- [Microsoft HAX Guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)
- [Google PAIR, Feedback and control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)
- [OpenAI, A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [OpenAI Academy, Projects](https://openai.com/academy/projects/)
- [GSMA, The Mobile Economy Africa 2025](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/africa-2025/)
- [Ghana Statistical Service, Business Tracker Wave 4](https://statsghana.gov.gh/gssmain/fileUpload/pressrelease/GSS_Update_Business%20Tracker%20Brief%20Report%20Wave%204.pdf)
- [World Bank, Strengthening AI foundations](https://www.worldbank.org/en/news/factsheet/2025/11/21/strengthening-ai-foundations-emerging-opportunities-for-developing-countries)
