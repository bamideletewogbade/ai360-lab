import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { checkDomain } = await import('../src/lib/studio/domains.ts')

/**
 * Checks the domain finder against real registries. Fixtures prove the logic;
 * only this proves the answers are true.
 */
const CASES = [
  { domain: 'google.com', expect: 'taken', why: 'obviously registered gTLD' },
  { domain: 'aithreesixty.tech', expect: 'taken', why: 'our own domain' },
  { domain: 'mtn.com.gh', expect: 'taken', why: 'RDAP alone would wrongly call this available' },
  { domain: 'ug.edu.gh', expect: 'taken', why: 'Ghanaian second level with live nameservers' },
  { domain: 'kpakpakpa-shitor-nkwan-2026.com', expect: 'available', why: 'nobody has registered this' },
  { domain: 'zzqq-nkrumah-test-2026.com.gh', expect: 'unknown', why: 'no registry to ask for .gh' },
]

const results = []
for (const testCase of CASES) {
  const result = await checkDomain(testCase.domain)
  const passed = result?.verdict === testCase.expect
  results.push(passed)
  console.log(`${passed ? 'pass' : 'FAIL'}  ${testCase.domain.padEnd(32)} ${String(result?.verdict).padEnd(10)} expected ${testCase.expect}`)
  console.log(`      ${testCase.why}`)
  if (!passed) console.log(`      got: ${result?.reason}`)
}

const failed = results.filter((passed) => !passed).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
if (failed) process.exitCode = 1
