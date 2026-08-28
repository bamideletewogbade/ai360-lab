# AI360 Africa — Pilot Recruitment Campaign

Everything for the pilot ad push lives in `src/remotion/campaign/`. It reuses the
existing Remotion setup, the `theme.ts` design tokens and the same brand lockup as
the product walkthroughs — so the ads and the explainer look like one system.

## What it produces

| Asset | Composition id | Size | Count |
|---|---|---|---|
| 20s video ad | `PilotAd-{audience}-{format}` | 1080×1920 / 1080×1080 / 1920×1080 | 12 |
| Poster | `PilotPoster-{audience}` | 1080×1350 | 4 |
| Carousel frame | `PilotCarousel-{audience}-{1..5}` | 1080×1350 | 20 |

**Audiences:** `careers`, `corporate`, `kids`, `educators` — the four audience doors.
**Formats:** `reel` (9:16), `square` (1:1), `wide` (16:9).

## Rendering

```bash
npm run video:dev              # Remotion Studio — preview every composition
npm run pilot:ads              # render all 36 assets into out/pilot/
npm run pilot:ads:video        # just the 12 videos
npm run pilot:ads:stills       # just the posters + carousels

node scripts/render-pilot-campaign.mjs --audience=careers
node scripts/render-pilot-campaign.mjs --only=video --format=reel
```

## Changing the copy

All copy is in **one file**: `src/remotion/campaign/audiences.ts`. Edit an audience
there and every video, poster and carousel frame for that audience updates. Nothing
is hardcoded in the components.

Each audience entry has:

- `hook` — the problem in the viewer's own words (video beat 1)
- `headline` / `subhead` — the promise (video beat 2, poster)
- `proof[3]` — three concrete things they will actually do
- `pilotOffer[3]` — what a pilot tester gives and gets (video beat 3)
- `carousel[5]` — problem → product → what you do → the pilot → how to join

## The video structure

20s / 600 frames at 30fps, four beats:

1. **0–4s Hook** — the problem, no product mention
2. **4–10s Product** — three concrete capabilities
3. **10–15s Pilot** — limited seats, free/pilot pricing, feedback in exchange
4. **15–20s CTA** — sign up at ai360.africa

One layout works at all three aspect ratios: everything is sized in `u` units
derived from the canvas's shorter edge (`useU()` in `kit.tsx`), so type stays
optically the same size in every crop. No per-format layouts to maintain.

## The funnel

Single CTA everywhere: **sign up at ai360.africa**. A free account signup is the
pilot registration — new signups get added to the pilot group, so there is no
separate form to maintain and no leak between "registered interest" and "actually
tried it". Email capture happens as a by-product of signup.

## Notes / possible next steps

- **Fonts.** The components use the `"Plus Jakarta Sans", "DM Sans"` stack, same as
  the existing scenes. If those aren't installed on the render machine Remotion
  falls back to a system grotesque. To pin it, add `@remotion/google-fonts` and call
  `loadFont()` in `kit.tsx`.
- **Product screenshots.** `ScreenshotShowcase.tsx` already exists — dropping a real
  workspace screenshot into video beat 2 would lift it a lot.
- **Voiceover / music.** Add with `<Audio />` in `PilotAd.tsx`; the beats are already
  cut at clean 4/6/5/5s boundaries.
- **Tracking.** Use a per-audience UTM on the URL card if you want to know which door
  is converting (e.g. `ai360.africa/?p=careers`).
