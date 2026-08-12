import { createHash } from 'node:crypto'

/**
 * Keeps caller-provided retry keys private and unique to the workspace that
 * owns them. This prevents one workspace from claiming another's key.
 */
export function scopedIdempotencyKey(namespace: string, workspaceKey: string, rawKey: string) {
  const digest = createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(workspaceKey)
    .update('\0')
    .update(rawKey)
    .digest('hex')
  return `${namespace.slice(0, 40)}:${digest}`
}
