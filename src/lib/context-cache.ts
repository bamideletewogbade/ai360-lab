/**
 * Short-TTL memoization for per-request context reads (project brief/files,
 * brand knowledge) that change infrequently but were being re-read from
 * Postgres on every chat message. Mirrors the module-level `globalThis`
 * pattern already used for the rate limiter in `guardrails.ts`, so state
 * survives Next.js dev-mode hot reloads instead of resetting per module
 * instance.
 */

type CacheEntry = { value: string; expiresAt: number }

const shared = globalThis as typeof globalThis & {
  __ai360ContextCache?: Map<string, CacheEntry>
}
const store = shared.__ai360ContextCache ?? new Map<string, CacheEntry>()
shared.__ai360ContextCache = store

function ttlMs() {
  const raw = Number(process.env.AI360_CONTEXT_CACHE_TTL_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 60_000
}

/** Set AI360_CONTEXT_CACHE_TTL_MS=0 to bypass the cache entirely. */
export async function cachedContext(key: string, load: () => Promise<string>): Promise<string> {
  const ttl = ttlMs()
  if (ttl === 0) return load()

  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  const value = await load()
  store.set(key, { value, expiresAt: now + ttl })
  return value
}
