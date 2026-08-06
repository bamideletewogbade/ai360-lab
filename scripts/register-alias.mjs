import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * Entry point for `node --import`, so the test runner understands the `@/`
 * alias. Without it, only modules with no imports could be tested, which is why
 * guardrails, usage and the studio packs had no coverage.
 */
register('./alias-loader.mjs', pathToFileURL('./scripts/'))
