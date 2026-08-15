import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, logEvent } from '@/lib/observability'

/**
 * Durable counter behind included everyday chat.
 *
 * Plain chat is free with a plan up to a daily fair-use cap, so that cap has
 * to survive what the in-memory rate limiter cannot: a deploy resetting every
 * allowance, and a second server instance doubling it. The count lives in
 * Postgres keyed by UTC date, which also makes the "resets at midnight UTC"
 * message literally true.
 *
 * The upsert is atomic (`on conflict ... do update ... returning`), so two
 * concurrent turns cannot both read the same count and both decide they are
 * inside the allowance.
 *
 * Returns the count after this turn, or null when the counter is unreachable.
 * Callers fall back to the in-memory daily bucket so chat never fails because
 * the billing database is slow or down; the per-minute rate limit still bounds
 * a burst during an outage.
 */
export async function consumeChatDailyCounter(subjectKey: string): Promise<number | null> {
  if (!isPostgresConfigured()) return null
  try {
    const sql = getPostgres()
    const today = new Date().toISOString().slice(0, 10)
    const [row] = await sql<{ count: string }[]>`
      insert into public.lab_chat_daily_counters (subject_key, usage_date, count, updated_at)
      values (${subjectKey}, ${today}, 1, now())
      on conflict (subject_key, usage_date)
      do update set count = public.lab_chat_daily_counters.count + 1, updated_at = now()
      returning count`
    return Number(row?.count ?? 0)
  } catch (error) {
    logEvent('warn', 'chat.daily_counter_unavailable', {
      subjectKey: subjectKey.slice(0, 80),
      ...errorDetails(error),
    })
    return null
  }
}
