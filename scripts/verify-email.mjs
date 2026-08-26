import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

// Same convention as the other diagnostics: point at a specific env file to
// check production values from a workstation.
const envFile = process.argv[2]
  || (existsSync(resolvePath(projectRoot, '.env.local')) ? '.env.local' : 'ai360-production.env')
config({ path: resolvePath(projectRoot, envFile), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { emailEnabled, isEmailConfigured, emailSettings, emailProviderName } =
  await import('../src/lib/email/config.ts')

/**
 * Read-only check of the transactional email plane.
 *
 * Sends nothing. It answers the questions that otherwise only get answered by
 * a failed batch: is the key real, is the from-address on a domain this account
 * has actually verified, and is anything about to be silently rejected.
 *
 * What it cannot check is whether the reply address *receives* mail. Resend
 * verifies sending only; delivery to the mailbox is the mail host's job. Send
 * it a message by hand.
 */

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}
function note(name, detail) {
  console.log(`NOTE  ${name}  ${detail}`)
}

function domainOf(address) {
  const match = String(address || '').match(/<([^>]+)>|^([^\s<>]+@[^\s<>]+)$/)
  const bare = match ? (match[1] || match[2]) : ''
  const at = bare.lastIndexOf('@')
  return at > 0 ? bare.slice(at + 1).toLowerCase() : ''
}

async function main() {
  console.log(`\nEnvironment file: ${envFile}\n`)

  const settings = emailSettings()
  const provider = emailProviderName()
  const fromDomain = domainOf(settings.from)
  const replyDomain = domainOf(settings.replyTo || '')

  console.log('Configured:')
  console.log(`  provider   ${provider}`)
  console.log(`  from       ${settings.from}`)
  console.log(`  reply-to   ${settings.replyTo || '(none)'}`)
  console.log(`  app url    ${settings.appUrl}\n`)

  check('EMAIL_ENABLED is true', emailEnabled())
  check('provider is resend', provider === 'resend', provider === 'resend' ? '' : `got "${provider}"`)
  check('from address parses to a domain', Boolean(fromDomain), fromDomain || 'EMAIL_FROM is malformed')

  // The single gate the application itself uses before it will send anything.
  check('application considers email configured', isEmailConfigured(),
    isEmailConfigured() ? '' : 'enabled, key and a valid EMAIL_FROM are all required')

  const key = (process.env.RESEND_API_KEY || '').trim()
  check('API key present', Boolean(key))
  if (key) {
    check('API key looks like a Resend key', key.startsWith('re_'),
      key.startsWith('re_') ? '' : 'expected it to start with re_')
  }

  if (!key) {
    console.log('\nWithout a key the provider cannot be reached. Nothing else can be checked.')
    return 1
  }

  // Read-only call. Listing domains proves the key authenticates and shows what
  // this account may actually send as.
  let payload
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (response.status === 401 || response.status === 403) {
      check('API key is accepted by Resend', false, `provider returned ${response.status}`)
      return 1
    }
    if (!response.ok) {
      check('API key is accepted by Resend', false, `provider returned ${response.status}`)
      return 1
    }
    payload = await response.json()
    check('API key is accepted by Resend', true)
  } catch (error) {
    check('Resend is reachable', false, error instanceof Error ? error.message : String(error))
    return 1
  }

  const domains = Array.isArray(payload?.data) ? payload.data : []
  console.log('\nDomains on this account:')
  if (!domains.length) console.log('  (none)')
  for (const domain of domains) {
    const status = String(domain.status || 'unknown')
    const flag = status.toLowerCase() === 'verified' ? '' : '   <-- not verified'
    console.log(`  ${String(domain.name).padEnd(34)} ${status}${flag}`)
  }
  console.log('')

  const match = domains.find((domain) => String(domain.name).toLowerCase() === fromDomain)
  check(`from-domain "${fromDomain}" exists on this account`, Boolean(match),
    match ? '' : 'Resend rejects every send from a domain it does not hold')
  if (match) {
    const verified = String(match.status || '').toLowerCase() === 'verified'
    check(`from-domain "${fromDomain}" is verified`, verified,
      verified ? '' : `status is "${match.status}" — sends will be refused`)
  }

  if (replyDomain && replyDomain !== fromDomain) {
    note('reply-to sits on a different domain than from',
      `${replyDomain} vs ${fromDomain}. Allowed, but some clients show it as a mismatch.`)
  }

  const appDomain = domainOf(`x@${String(settings.appUrl).replace(/^https?:\/\//, '')}`)
  if (appDomain && fromDomain && !appDomain.includes(fromDomain) && !fromDomain.includes(appDomain)) {
    note('sender domain differs from the link domain',
      `mail from ${fromDomain}, links to ${appDomain}. Fine, but warm the sender before a large batch.`)
  }

  console.log('\nNot checked here, and it matters:')
  console.log(`  - whether ${settings.replyTo || 'the reply address'} actually RECEIVES mail.`)
  console.log('    Resend verifies sending only. Send it a message by hand and confirm it lands.')
  console.log('  - the Supabase redirect allowlist, which invitation links depend on separately.')

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks pass.`)
  return failed.length ? 1 : 0
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`Email verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
