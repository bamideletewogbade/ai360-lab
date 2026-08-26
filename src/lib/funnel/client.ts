'use client'

import {
  normalizeInvitationId,
  FUNNEL_INVITATION_PARAM,
  type FunnelStep,
  type Surface,
} from '@/lib/funnel/contract'

/**
 * Browser side of the funnel.
 *
 * Everything here is best-effort and silent. A blocked request, a full storage
 * quota or a private window must leave the product working exactly as it would
 * have; measurement is never worth a broken page.
 */

const VISITOR_STORAGE_KEY = 'ai360.visitor'
const INVITATION_STORAGE_KEY = 'ai360.invitation'
const SENT_STORAGE_KEY = 'ai360.funnel.sent'
const INVITATION_QUERY_PARAM = FUNNEL_INVITATION_PARAM

function storage(): Storage | null {
  try {
    const probe = window.localStorage
    probe.getItem(VISITOR_STORAGE_KEY)
    return probe
  } catch {
    // Private mode, disabled site data, or an embedded context. The visit still
    // works; it simply is not counted.
    return null
  }
}

/** True when the visitor asked not to be measured. Checked before every send. */
export function trackingRefused() {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as Navigator & { doNotTrack?: string; globalPrivacyControl?: boolean }
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true
    || (typeof window !== 'undefined' && (window as { doNotTrack?: string }).doNotTrack === '1')
}

function randomKey() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The opaque id that lets an anonymous landing and a later sign-in be seen as
 * one visit. Random, meaningless off the funnel table, and never sent anywhere
 * but AI360's own endpoint.
 */
export function visitorKey(): string | null {
  const store = storage()
  if (!store) return null
  try {
    const existing = store.getItem(VISITOR_STORAGE_KEY)
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing
    const minted = randomKey()
    store.setItem(VISITOR_STORAGE_KEY, minted)
    return minted
  } catch {
    return null
  }
}

/**
 * Reads the invitation id out of the landing URL and remembers it.
 *
 * It has to be remembered rather than read each time: the sign-up round trip
 * drops the query string, and without it the whole journey after the first page
 * would be anonymous — which is precisely the attribution the funnel exists for.
 * The parameter is then stripped from the address bar so it is not carried into
 * a shared link or a screenshot.
 */
export function invitationIdInUrl(): string | null {
  try {
    return normalizeInvitationId(
      new URL(window.location.href).searchParams.get(INVITATION_QUERY_PARAM),
    )
  } catch {
    return null
  }
}

export function captureInvitationId(): string | null {
  const store = storage()
  try {
    const url = new URL(window.location.href)
    const fromUrl = normalizeInvitationId(url.searchParams.get(INVITATION_QUERY_PARAM))
    if (fromUrl) {
      store?.setItem(INVITATION_STORAGE_KEY, fromUrl)
      url.searchParams.delete(INVITATION_QUERY_PARAM)
      window.history.replaceState({}, '', url.toString())
      return fromUrl
    }
    return normalizeInvitationId(store?.getItem(INVITATION_STORAGE_KEY))
  } catch {
    return null
  }
}

function surface(): Surface {
  const width = window.innerWidth || 1024
  if (width < 768) return 'mobile'
  return width < 1024 ? 'tablet' : 'desktop'
}

function sentSteps(): string[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(SENT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** Whether this browser has already reached a step. Read-only. */
export function hasSentStep(step: FunnelStep) {
  return sentSteps().includes(step)
}

/** Steps already sent from this browser, so a re-render cannot re-send one. */
function alreadySent(step: FunnelStep) {
  const store = storage()
  if (!store) return false
  try {
    const sent = sentSteps()
    if (sent.includes(step)) return true
    store.setItem(SENT_STORAGE_KEY, JSON.stringify([...sent, step].slice(-20)))
    return false
  } catch {
    return false
  }
}

/**
 * Sends one step, at most once per browser.
 *
 * `keepalive` so a step fired as the page navigates away still arrives — the
 * sign-up click is exactly that case, and it is the most important step in the
 * funnel to not lose.
 */
export function trackFunnelStep(step: FunnelStep) {
  if (typeof window === 'undefined' || trackingRefused()) return
  const key = visitorKey()
  if (!key || alreadySent(step)) return

  const payload = JSON.stringify({
    step,
    visitorKey: key,
    invitationId: captureInvitationId(),
    surface: surface(),
    referrer: document.referrer || null,
  })

  try {
    void fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      cache: 'no-store',
    }).catch(() => undefined)
  } catch {
    // Never rethrow: a measurement failure is not a product failure.
  }
}
