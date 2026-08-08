import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import test from 'node:test'

const sourceExtensions = new Set(['.ts', '.tsx', '.css', '.json', '.txt', '.webmanifest', '.md', '.mjs'])
const legacySpellings = [`AI${' '}360`, `AI${' '}Three${' '}Sixty`]
const excludedDirectories = new Set(['.git', '.next', 'node_modules'])

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : filesUnder(path)
    return sourceExtensions.has(extname(path)) || entry.name === '.env.example' ? [path] : []
  })
}

test('the canonical AI360 name is used across product and public files', () => {
  const files = filesUnder('.')
    .filter((path) => path !== join('src', 'lib', 'brand.ts') && path !== 'AGENTS.md')

  const violations = files.flatMap((path) => {
    const content = readFileSync(path, 'utf8')
    return legacySpellings.filter((spelling) => content.includes(spelling)).map((spelling) => `${path}: ${spelling}`)
  })

  assert.deepEqual(violations, [], `Use AI360 in product copy. Legacy spellings belong only in BRAND.legacyNames.\n${violations.join('\n')}`)
})
