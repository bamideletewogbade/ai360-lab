/**
 * Conversation sync primitives.
 *
 * AI360 is local-first: the browser is the working copy and the server is the
 * durable, cross-device mirror. Rather than one side owning the whole list —
 * which lets a stale device delete another's newer work — records are merged by
 * id with a last-writer-wins clock (`updatedAt`). These helpers are pure so the
 * merge rules can be unit tested without a database or a browser.
 */

export type SyncableConversation = {
  id: string
  updatedAt: number
  messages: unknown[]
}

/**
 * Union several conversation lists by id, keeping the newest version of each and
 * returning them newest-first. Later lists win ties, so callers order arguments
 * from least to most authoritative (local, cloud) when timestamps match.
 */
export function mergeById<T extends { id: string; updatedAt: number }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>()
  for (const list of lists) {
    for (const item of list) {
      const existing = byId.get(item.id)
      if (!existing || (item.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) byId.set(item.id, item)
    }
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/**
 * A conversation is worth persisting to the cloud only once it holds a message.
 * An empty "New conversation" is a local draft; syncing it would scatter blank
 * threads across every device the person signs in on.
 */
export function hasContent(conversation: SyncableConversation): boolean {
  return Array.isArray(conversation.messages) && conversation.messages.length > 0
}

/** The conversations that should be sent to the server: real ones only. */
export function syncableOnly<T extends SyncableConversation>(conversations: T[]): T[] {
  return conversations.filter(hasContent)
}
