# AI360 context and prompt pipeline

Last reviewed: 9 August 2026

## Principle

AI360 does not “improve” a user prompt by silently rewriting it into something the person did not ask. The original request remains the source of truth. We improve the context around it, grant only the capabilities it needs, and measure the result.

Current research describes this as context engineering: select the smallest set of high-signal instructions, history, tools and evidence that gives the model the best chance of useful work. More context is not automatically better.

## Layers

```mermaid
flowchart LR
  U["User words"] --> V["Validate and bound"]
  V --> R["Route once"]
  R --> C["Select useful context"]
  C --> T["Grant needed tools"]
  T --> M["Choose model and budget"]
  M --> X["Execute"]
  X --> E["Evaluate"]
  E --> O["Return outcome"]
  O --> F["Consent-based feedback"]
  F --> G["Regression tests"]
```

### 1. User words

Preserve the request, spelling, language, constraints and attachments. Never invent a clearer goal on the person’s behalf. Ask one question only when a missing choice would materially change the work.

### 2. Validate and bound

Remove control characters, reject client-supplied system roles, cap each message, cap total history and keep the newest useful turns. Attachments have separate type and size policy.

### 3. Route once

Hard requirements such as current information, attachments and durable project intent are detected at the server boundary. Ambiguous first turns are eligible for shadow model classification. Deterministic routing remains the fallback.

### 4. Select useful context

Identity and safety instructions come first. The requested response language is explicit. Recent conversation is bounded to 20 turns and 120,000 characters. Long-term project state should enter as structured facts and approved summaries, not as a complete token replay.

### 5. Grant needed tools

Simple writing and explanation do not receive web tools. Current facts, URLs, comparison and verification do. An explicit request not to browse wins. Research and Studio specialists receive only the capabilities declared by their job.

### 6. Choose model and budget

Text work starts with the cost-effective text route. Vision is selected only for actual visual attachments. Reasoning and output are bounded. Provider fallbacks cannot weaken tool or privacy requirements.

### 7. Execute

Direct chat streams one response. Research uses a bounded planner, parallel investigation, synthesis and verification. Projects use a type-specific brief, staged specialists, quality correction, normalization and approval. Paid multi-step work will move to durable execution one idempotent provider operation at a time.

### 8. Evaluate

Measure route accuracy, task completion, citation validity, language quality, correction rate, latency, cost and user overrides. Evaluate full traces for agent work, not just final prose.

### 9. Learn safely

Feedback includes message content only with permission. Quality cases become labelled evaluations after human review. A model can recommend priority, but rules and humans own serious safety, privacy and financial decisions.

## What changed in this slice

- `prepareConversationContext` removes untrusted system roles and bounds history without rewriting it.
- `policyForConversation` decides whether live tools are justified.
- Plain chat no longer attaches web tools to every request.
- Research requests reserve the correct research credit class.
- Provider routing only receives tool-compatible constraints when tools are actually attached.
- Logs include context size and capability policy, not the full prompt.

## Next evaluation work

- Build locked test sets for routing, context truncation, prompt injection, tool selection and response language.
- Add approved conversation compaction only after it beats the bounded recent-history baseline.
- Measure helpfulness and factuality before and after each prompt change.
- Track cost and p95 latency by pipeline layer so improvements are attributable.

## References

- [Anthropic, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [OpenAI, Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/)
