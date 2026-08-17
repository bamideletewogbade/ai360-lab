import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Resolves the `@/` path alias for plain Node.
 *
 * Next.js understands `tsconfig.json` paths; `node --test` does not, which is
 * why the test suite could previously only cover modules with no imports.
 * Register with: node --import ./scripts/alias-loader.mjs
 *
 * The project root is derived from this file's own location rather than
 * `process.cwd()`, so scripts keep working no matter which directory they are
 * run from (`node scripts/foo.mjs` or `cd scripts && node foo.mjs`).
 */
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']
const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `server-only` is a Next.js virtual module: the bundler replaces it with a
 * no-op on the server and a build error on the client, but it is not a real
 * package, so plain Node cannot import it. Tests that reach server-only code
 * (e.g. observability -> log-sink) get this empty stub instead — the marker
 * has served its purpose by the time the tests run.
 */
const SERVER_ONLY_STUB = 'data:text/javascript,export default {};'

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return nextResolve(SERVER_ONLY_STUB, context)
  }
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const base = resolvePath(projectRoot, 'src', specifier.slice(2))
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context)
    }
  }
  return nextResolve(specifier, context)
}
