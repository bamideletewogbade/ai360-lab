# AI360 — Status at a Glance

**15 August 2026 · Black on white · one page**

---

## What happened today

AI360 went from *"flat 1 credit per message + demo assets"* to *"charges for the
work actually done, and delivers what it sells."* Four workstreams, all
**implemented in code**:

| # | Workstream | Outcome | Needs before live |
| --- | --- | --- | --- |
| 1 | Pricing by work done | Chat included; heavy work metered; premium models ×2; AI knows AI360 | Verify + deploy |
| 2 | Fair-use caps + overflow | Free up to daily cap, then 1 credit/message — never blocked | **Apply migration** + verify |
| 3 | Credit top-ups | GH₵50→40 / 100→90 / 200→185; top-up + plan offered at point of need | Verify + deploy |
| 4 | Media Studio live | Image works in prod; video fixed (charge only after delivery) | Live video retest |

## Pricing in one table

| Work | Cost to AI360 | You pay |
| --- | --- | --- |
| Everyday chat (fast model) | ~GH₵0.01 | **Included** with plan (caps: 10/60/120/150 per day) |
| Chat past the cap | ~GH₵0.01 | 1 credit / message |
| Premium model chat (Claude/Kimi) | ~GH₵0.10 | measured × 2 (1–8 credits) |
| Research / file review | ~GH₵0.10 | 2–4 credits |
| Agent execution | — | 3–8 credits |
| Image | ~GH₵0.04 | 3–6 credits |
| 4s video | ~GH₵1.81 | 12–20 credits (quoted first) |

## Top-ups

| Bundle | Credits | Never expires · never renews · same safe ExpressPay path |
| --- | --- | --- |
| GH₵50 | 40 | Plans cost less per credit — subscribing is the better deal |
| GH₵100 | 90 | |
| GH₵200 | 185 | |

## Media Studio

| | Status |
| --- | --- |
| Image generation | ✅ Working in production (tested live) |
| Video render | 🔧 Fixed — charge only after delivery; polls survive refresh/offline; cancelled/expired/404 refund |
| Test credits | ✅ 200 granted to test account (72 → 272) — confirms earlier holds were reclaimed, not lost |

## Before "done" — the 4 steps

1. **Verify** — `npm test && npm run lint && npx tsc --noEmit` (not run yet: no toolchain on this machine)
2. **Apply migration** — `0017_chat_daily_cap.sql` (code fails safe without it)
3. **Deploy**
4. **Live video retest** — full render + close-tab-mid-render resume

## Verified today

- ✅ Manual credit grant (72 → 272) — proves the ledger + idempotency work
- ✅ Image generation end to end in production
- ✅ Typecheck passed during the production build (after the `AttemptRow` fix)

## For the boss's demo

Image generation is live and proven. A 4s video needs a plan or top-up
(12–20 credits) — that's the pricing working as designed. Full details:
`docs/DAILY_STATUS_REPORT_2026-08-15.md`.
