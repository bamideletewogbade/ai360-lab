import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Resolves the `@/` path alias for plain Node.
 *
 * Next.js understands `tsconfig.json` paths; `node --test` does not, which is
 * why the test suite could previously only cover modules with no imports.
 * Register with: node --import ./scripts/alias-loader.mjs
 */
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const base = resolvePath(process.cwd(), 'src', specifier.slice(2))
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context)
    }
  }
  return nextResolve(specifier, context)
}
