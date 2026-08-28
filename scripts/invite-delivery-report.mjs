import { dirname, resolve as resolvePath } from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')
config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

/**
 * What happened to each invitation after it left the building.
 *
 * The application only records that a send was accepted by the provider. That
 * is not delivery: an address can be accepted and then hard-bounce, land in
 * spam, or be silently dropped. Those are three different problems with three
 * different fixes, and a low claim rate on its own cannot tell them apart.
 *
 * Read-only. Talks to Postgres for the message ids and to Resend for the
 * outcome of each; writes nothing to either.
 */

const key = process.env.RESEND_API_KEY
if (!key) {
  console.error('RESEND_API_KEY is not set in .env.local')
  process.exitCode = 1
} else {
  const { getPostgres } = await import('../src/lib/postgres.ts')
  const sql = getPostgres()

  const rows = await sql`
    select distinct on (i.id)
           i.id, i.email, i.accepted_at, e.provider_message_id, e.created_at sent_at
      from public.lab_admin_invitations i
      join public.lab_admin_invitation_events e on e.invitation_id = i.id
     where e.provider_message_id is not null
     order by i.id, e.created_at desc`

  console.log(`Checking ${rows.length} invitations against Resend\n`)

  // Resend's default allowance is about two requests a second. Pacing under it
  // is cheaper than discovering the ceiling and retrying sixty-five times.
  const wait = (ms) => new Promise((done) => setTimeout(done, ms))
  const results = []

  /** One lookup, retried only for the one failure that waiting actually fixes. */
  async function lookup(messageId, attempt = 0) {
    const response = await fetch(`https://api.resend.com/emails/${messageId}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 429 && attempt < 3) {
      await wait(2_500 * (attempt + 1))
      return lookup(messageId, attempt + 1)
    }
    if (!response.ok) return `http_${response.status}`
    const body = await response.json()
    return body.last_event || 'unknown'
  }

  for (const [index, row] of rows.entries()) {
    if (index > 0) await wait(520)
    try {
      results.push({ ...row, event: await lookup(row.provider_message_id) })
    } catch {
      results.push({ ...row, event: 'lookup_failed' })
    }
    process.stdout.write('.')
  }
  console.log('\n')

  const byEvent = new Map()
  for (const r of results) byEvent.set(r.event, (byEvent.get(r.event) || 0) + 1)

  console.log('=== delivery outcome ===')
  const ORDER = ['delivered', 'opened', 'clicked', 'sent', 'delivery_delayed', 'bounced', 'complained']
  const sorted = [...byEvent.entries()].sort((a, b) => {
    const ai = ORDER.indexOf(a[0]), bi = ORDER.indexOf(b[0])
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
  for (const [event, n] of sorted) {
    const pct = ((n / results.length) * 100).toFixed(1)
    console.log(`  ${String(event).padEnd(18)} ${String(n).padStart(3)}  ${pct.padStart(5)}%`)
  }

  const bad = results.filter((r) => ['bounced', 'complained'].includes(r.event))
  if (bad.length) {
    console.log('\n=== needs attention ===')
    for (const r of bad) console.log(`  ${r.event.padEnd(11)} ${r.email}`)
  }

  const reached = results.filter((r) => ['delivered', 'opened', 'clicked'].includes(r.event))
  const claimed = results.filter((r) => r.accepted_at)
  console.log('\n=== funnel ===')
  console.log(`  sent               ${results.length}`)
  console.log(`  reached the inbox  ${reached.length}`)
  console.log(`  claimed            ${claimed.length}`)
  if (reached.length) {
    console.log(`  claim rate of those that arrived: ${((claimed.length / reached.length) * 100).toFixed(1)}%`)
  }

  const openable = byEvent.get('opened') || byEvent.get('clicked')
  if (!openable) {
    console.log('\n  NOTE: no opens or clicks recorded at all. Either nobody has opened')
    console.log('  the message, or open tracking is switched off in Resend — in which')
    console.log('  case "delivered" is the furthest this report can see.')
  }

  await sql.end({ timeout: 5 })
}
