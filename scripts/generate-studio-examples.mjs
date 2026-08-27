import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from 'dotenv'

const run = promisify(execFile)

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })

/**
 * Renders the Media Studio example gallery.
 *
 * These are the four images and four videos a new arrival sees before they have
 * made anything themselves, so they are the product's first claim about what it
 * can do. They are generated once, by an operator, and committed — not rendered
 * per visitor.
 *
 * Deliberately talks to OpenRouter directly rather than going through
 * /api/studio/*. Those routes reserve and settle credits against a real
 * workspace, and charging a participant's ledger for the shop window would be
 * wrong twice over: it corrupts the pilot's usage figures and spends an
 * allowance that belongs to somebody else. This spend is a product cost.
 *
 * Usage:
 *   node scripts/generate-studio-examples.mjs --dry-run     print prompts, spend nothing
 *   node scripts/generate-studio-examples.mjs --images      images only
 *   node scripts/generate-studio-examples.mjs --videos      videos only
 *   node scripts/generate-studio-examples.mjs               everything
 */

const OUT_DIR = resolvePath(projectRoot, 'public/examples')

/** Matches the studio's own `standard` tier — the middle engine, not the dearest. */
const VIDEO_MODEL = 'google/veo-3.1-fast'

/**
 * The same ordered list `/api/studio/image` walks, and for the same reason:
 * gpt-image-1-mini is cheapest but only renders 1:1, 3:2 and 2:3, so every
 * wide shape falls through to Gemini. A single-model script silently fails on
 * three quarters of these; the product does not, because it retries.
 */
const IMAGE_MODELS = ['openai/gpt-image-1-mini', 'google/gemini-3.1-flash-lite-image']

/** Per-provider request shape, mirroring `modelOptions` in the image route. */
function imageOptions(model, spec) {
  if (model.startsWith('openai/')) {
    return { aspect_ratio: spec.aspectRatio, quality: 'high', background: 'opaque' }
  }
  if (model.startsWith('google/')) {
    // 1K is the only resolution this model's providers accept. The studio gets
    // away with passing `intent.resolution` because it defaults to 1K for
    // images — but the intent schema also permits 2K, and a 2K request in a
    // wide shape has no model that can serve it. Worth fixing there separately.
    return { resolution: '1K', aspect_ratio: spec.aspectRatio }
  }
  return { aspect_ratio: spec.aspectRatio }
}

/**
 * Written against the cohort actually invited: 17 students, 15 professionals,
 * 11 entrepreneurs, 10 educators. Each example is the kind of thing one of those
 * groups would come here to make, so the gallery reads as "this is for me"
 * rather than as a technology demonstration.
 *
 * No named or recognisable people anywhere. These ship publicly, and a
 * synthetic likeness presented as a Ghanaian person is not something to publish
 * without a deliberate decision. Faces are incidental, turned away or absent.
 */
const IMAGES = [
  {
    id: 'shea-product',
    audience: 'Entrepreneur',
    label: 'Product photo for a small skincare business',
    aspectRatio: '1:1',
    prompt:
      'Product photograph of three amber glass jars of raw shea butter arranged on a handwoven raffia mat, ' +
      'on a weathered wooden table. Warm early-morning light from a window at the left, soft shadows. ' +
      'Background is a softly blurred wall in ochre and deep red. Natural, tactile, unglamorised. ' +
      'Clean empty space in the upper third for a headline. No text, no logos, no watermark, no people.',
  },
  {
    id: 'water-cycle',
    audience: 'Student',
    label: 'Diagram for a science revision sheet',
    // 16:9 rather than the 4:3 a worksheet suggests: the studio only offers
    // 1:1, 2:3, 9:16 and 16:9, and an example nobody can reproduce in the
    // product is worse than one in a slightly odd shape.
    aspectRatio: '16:9',
    prompt:
      'A clear, simple educational illustration of the water cycle set over a West African savanna landscape: ' +
      'baobab trees, dry golden grass, a river, and gathering rain clouds above. Arrows showing evaporation, ' +
      'condensation and rainfall drawn as clean flat vector shapes in blue and white over the scene. ' +
      'Bright, friendly, textbook-quality. No text, no labels, no letters of any kind, no watermark.',
  },
  {
    id: 'classroom',
    audience: 'Educator',
    label: 'Cover for a school newsletter',
    aspectRatio: '16:9',
    prompt:
      'Warm editorial illustration of a Ghanaian primary school classroom seen from the back of the room: ' +
      'rows of wooden desks, pupils in blue and yellow uniforms facing away toward a chalkboard, ' +
      'a teacher standing at the board. Sunlight falling through louvred windows onto the floor. ' +
      'Painterly, optimistic, dignified. Faces not visible. No text, no writing on the board, no watermark.',
  },
  {
    id: 'accra-proposal',
    audience: 'Professional',
    label: 'Cover image for a business proposal',
    aspectRatio: '16:9',
    prompt:
      'The Accra skyline at dusk photographed from inside a darkened glass-walled office, looking out. ' +
      'City lights beginning to come on, deep indigo sky with a band of warm gold at the horizon, ' +
      'faint reflections on the glass. Calm, corporate, restrained. Wide empty sky in the upper half ' +
      'for a title. No people, no text, no logos, no watermark.',
  },
]

const VIDEOS = [
  {
    id: 'jollof-kitchen',
    audience: 'Food business',
    label: 'Social post for a catering business',
    aspectRatio: '9:16',
    seconds: 6,
    prompt:
      'Close-up food video in a warm kitchen: a wide pan of jollof rice steaming, the steam catching the light. ' +
      'Slow push-in on the rice, then hands lifting a serving spoon and plating it. Rich reds and oranges, ' +
      'natural window light from one side. Appetising and unhurried, one continuous moment. ' +
      'No text, no captions, no logos, no watermark, no visible faces.',
  },
  {
    id: 'fabric-shop',
    audience: 'Trader / retail',
    label: 'Shop window clip for a fabric seller',
    aspectRatio: '9:16',
    seconds: 6,
    prompt:
      'A bolt of brightly patterned West African wax print fabric unrolling in slow motion across a wooden counter, ' +
      'revealing its pattern. Sunlight moves across the cloth as it unfurls, picking out the indigo, ' +
      'saffron and green. Shallow depth of field, other folded bolts blurred behind. Tactile and rich. ' +
      'No text, no logos, no watermark, no people.',
  },
  {
    id: 'study-desk',
    audience: 'Student',
    label: 'Opening shot for a portfolio or project video',
    aspectRatio: '16:9',
    seconds: 4,
    prompt:
      'A quiet study desk in early morning: an open notebook with handwriting-like marks, a laptop, ' +
      'a glass of water, a pair of glasses. Slow drift of the camera from left to right as a shaft of ' +
      'sunlight moves across the desk surface and dust turns in the light. Calm, focused, warm. ' +
      'No readable text, no logos, no watermark, no people.',
  },
  {
    id: 'coastal-town',
    audience: 'Community / NGO',
    label: 'Establishing shot for a community project film',
    aspectRatio: '16:9',
    seconds: 6,
    prompt:
      'Slow aerial drift over a Ghanaian coastal town at golden hour: rust-red and pale rooftops, ' +
      'palm trees, sandy lanes between the houses, the Atlantic breaking on the shore beyond. ' +
      'Long warm light and soft haze. Steady, cinematic, affectionate. ' +
      'No text, no logos, no watermark, no identifiable faces.',
  },
]

const argv = process.argv.slice(2)
const args = new Set(argv)
const dryRun = args.has('--dry-run')
/** `--only=classroom,study-desk` re-renders just those, so a partial failure
 *  costs only the assets that actually failed. */
const only = new Set(
  (argv.find((entry) => entry.startsWith('--only='))?.slice('--only='.length) || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
)
const doImages = args.has('--images') || !(args.has('--videos'))
const doVideos = args.has('--videos') || !(args.has('--images'))

const key = process.env.OPENROUTER_API_KEY
if (!key && !dryRun) {
  console.error('OPENROUTER_API_KEY is not set. Add it to .env.local, or pass --dry-run.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
  'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
}

/** Real cost, read back from the provider — never an estimate. */
let spentUsd = 0
const results = []

function money(value) {
  return `$${value.toFixed(4)}`
}

async function generateImage(spec) {
  let lastFailure = 'no model attempted'
  for (const model of IMAGE_MODELS) {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model,
        prompt: spec.prompt,
        n: 1,
        ...imageOptions(model, spec),
      }),
    })
    if (!response.ok) {
      lastFailure = `${model} returned ${response.status}: ${(await response.text()).slice(0, 200)}`
      continue
    }
    const body = await response.json()
    const image = body.data?.[0]
    if (!image?.b64_json) {
      lastFailure = `${model} returned no image`
      continue
    }
    // Only counted once the bytes are in hand — a rejected request costs nothing.
    const cost = Number(body.usage?.cost) || 0
    spentUsd += cost

    const extension = (image.media_type || 'image/png').split('/')[1] === 'jpeg' ? 'jpg' : 'png'
    const file = `${spec.id}.${extension}`
    await writeFile(resolvePath(OUT_DIR, file), Buffer.from(image.b64_json, 'base64'))
    return { file, cost, model }
  }
  throw new Error(lastFailure)
}

async function generateVideo(spec) {
  const submission = await fetch('https://openrouter.ai/api/v1/videos', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: VIDEO_MODEL,
      prompt: spec.prompt,
      duration: spec.seconds,
      aspect_ratio: spec.aspectRatio,
      generate_audio: false,
    }),
  })
  if (!submission.ok) {
    throw new Error(`videos returned ${submission.status}: ${(await submission.text()).slice(0, 300)}`)
  }
  const job = await submission.json()
  const id = job.id
  if (!id) throw new Error('provider returned no job id')

  // Veo renders take minutes, not seconds. Poll patiently rather than giving up
  // on a job that has already been paid for.
  const deadline = Date.now() + 12 * 60_000
  let status = job.status
  let finished = job
  while (Date.now() < deadline) {
    if (status === 'completed') break
    if (status === 'failed' || status === 'cancelled' || status === 'expired') {
      throw new Error(`render ${status}`)
    }
    await new Promise((done) => setTimeout(done, 10_000))
    const poll = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!poll.ok) continue
    finished = await poll.json()
    status = finished.status
    process.stdout.write('.')
  }
  if (status !== 'completed') throw new Error('render did not finish in twelve minutes')

  const cost = Number(finished.usage?.cost) || 0
  spentUsd += cost

  const content = await fetch(
    `https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}/content?index=0`,
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(180_000) },
  )
  if (!content.ok) throw new Error(`download returned ${content.status}`)
  const file = `${spec.id}.mp4`
  const videoPath = resolvePath(OUT_DIR, file)
  await writeFile(videoPath, Buffer.from(await content.arrayBuffer()))
  await extractPoster(spec, videoPath)
  return { file, cost }
}

/**
 * A still frame for each clip.
 *
 * The gallery sets `preload="none"` on video in data-saver mode, which is a
 * real setting for this audience — without a poster those cards render as
 * blank boxes on exactly the connections that can least afford to fetch the
 * video to find out what is in it. Taken a second in, because frame zero of a
 * generated clip is often the faded-in one.
 */
async function extractPoster(spec, videoPath) {
  const posterPath = resolvePath(OUT_DIR, `${spec.id}-poster.jpg`)
  try {
    await run('ffmpeg', [
      '-y',
      '-loglevel', 'error',
      '-ss', '1',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '4',
      posterPath,
    ])
  } catch (cause) {
    // Not fatal. The clip is rendered and paid for; a missing poster costs a
    // blank card in data-saver mode, not a lost asset.
    console.warn(`  poster failed for ${spec.id}: ${cause instanceof Error ? cause.message : cause}`)
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const queue = [
    ...(doImages ? IMAGES.map((spec) => ({ ...spec, kind: 'image' })) : []),
    ...(doVideos ? VIDEOS.map((spec) => ({ ...spec, kind: 'video' })) : []),
  ].filter((spec) => (only.size ? only.has(spec.id) : true))

  if (only.size) {
    const unknown = [...only].filter(
      (id) => ![...IMAGES, ...VIDEOS].some((spec) => spec.id === id),
    )
    if (unknown.length) {
      console.error(`Unknown --only id(s): ${unknown.join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`${dryRun ? 'DRY RUN — nothing will be generated' : 'Generating'}  ${queue.length} assets`)
  console.log(`  images  ${IMAGE_MODELS.join(' → ')}`)
  console.log(`  videos  ${VIDEO_MODEL}`)
  console.log(`  into    public/examples/\n`)

  for (const spec of queue) {
    console.log(`[${spec.kind}] ${spec.id}  — ${spec.audience}: ${spec.label}`)
    if (dryRun) {
      console.log(`  ${spec.aspectRatio}${spec.seconds ? ` · ${spec.seconds}s` : ''}`)
      console.log(`  ${spec.prompt}\n`)
      continue
    }
    try {
      const started = Date.now()
      const done = spec.kind === 'image' ? await generateImage(spec) : await generateVideo(spec)
      const seconds = Math.round((Date.now() - started) / 1000)
      console.log(`  ok  ${done.file}  ${money(done.cost)}  ${seconds}s${done.model ? `  ${done.model}` : ''}\n`)
      results.push({ ...spec, ...done })
    } catch (cause) {
      // One failure must not abandon the assets that already rendered and were
      // already paid for.
      console.error(`  FAILED  ${cause instanceof Error ? cause.message : cause}\n`)
      results.push({ ...spec, error: String(cause) })
    }
  }

  if (dryRun) return

  const ok = results.filter((entry) => !entry.error)
  console.log('—'.repeat(60))
  console.log(`generated  ${ok.length}/${results.length}`)
  console.log(`spent      ${money(spentUsd)}  (real provider cost, not an estimate)`)
  if (ok.length < results.length) {
    console.log(`failed     ${results.filter((entry) => entry.error).map((entry) => entry.id).join(', ')}`)
  }
}

await main()
