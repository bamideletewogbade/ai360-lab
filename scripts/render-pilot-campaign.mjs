#!/usr/bin/env node
/**
 * Render the AI360 Africa pilot campaign.
 *
 *   node scripts/render-pilot-campaign.mjs
 *   node scripts/render-pilot-campaign.mjs --audience=careers
 *   node scripts/render-pilot-campaign.mjs --only=carousel
 *   node scripts/render-pilot-campaign.mjs --audience=corporate --only=video --format=reel
 *
 * Outputs land in out/pilot/{video,poster,carousel}/.
 * Composition ids are generated in src/remotion/Root.tsx from
 * src/remotion/campaign/audiences.ts — change the copy there, re-run this.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const ENTRY = 'src/remotion/index.ts'
const OUT = 'out/pilot'

const AUDIENCES = ['careers', 'corporate', 'kids', 'educators']
const FORMATS = ['reel', 'square', 'wide']
const CAROUSEL_FRAMES = 5

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)

const audiences = args.audience ? [args.audience] : AUDIENCES
const formats = args.format ? [args.format] : FORMATS
const only = args.only ? String(args.only).split(',') : ['video', 'poster', 'carousel']

for (const a of audiences) {
  if (!AUDIENCES.includes(a)) {
    console.error(`Unknown audience "${a}". Expected one of: ${AUDIENCES.join(', ')}`)
    process.exit(1)
  }
}

const jobs = []

if (only.includes('video')) {
  for (const audience of audiences) {
    for (const format of formats) {
      jobs.push({
        kind: 'render',
        id: `PilotAd-${audience}-${format}`,
        out: path.join(OUT, 'video', `ai360-pilot-${audience}-${format}.mp4`),
      })
    }
  }
}

if (only.includes('poster')) {
  for (const audience of audiences) {
    jobs.push({
      kind: 'still',
      id: `PilotPoster-${audience}`,
      out: path.join(OUT, 'poster', `ai360-pilot-poster-${audience}.png`),
    })
  }
}

if (only.includes('carousel')) {
  for (const audience of audiences) {
    for (let i = 1; i <= CAROUSEL_FRAMES; i++) {
      jobs.push({
        kind: 'still',
        id: `PilotCarousel-${audience}-${i}`,
        out: path.join(OUT, 'carousel', `ai360-pilot-${audience}-${String(i).padStart(2, '0')}.png`),
      })
    }
  }
}

if (jobs.length === 0) {
  console.error('Nothing to render. Check --only (video, poster, carousel).')
  process.exit(1)
}

for (const dir of ['video', 'poster', 'carousel']) {
  mkdirSync(path.join(OUT, dir), { recursive: true })
}

console.log(`Rendering ${jobs.length} asset(s) into ${OUT}/\n`)

let failed = 0
jobs.forEach((job, n) => {
  const label = `[${n + 1}/${jobs.length}] ${job.id}`
  console.log(`${label} → ${job.out}`)
  const result = spawnSync(
    'npx',
    ['remotion', job.kind === 'still' ? 'still' : 'render', ENTRY, job.id, job.out],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  )
  if (result.status !== 0) {
    failed++
    console.error(`${label} FAILED\n`)
  }
})

console.log(
  failed === 0
    ? `\nDone. ${jobs.length} asset(s) written to ${OUT}/`
    : `\nFinished with ${failed} failure(s) out of ${jobs.length}.`
)
process.exit(failed === 0 ? 0 : 1)
