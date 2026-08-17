'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type CreditGuide = Array<{ task: string; credits: string }>

/**
 * A calm, credit-based usage indicator.
 *
 * The frontier apps show token counts because their audience thinks in tokens.
 * AI360's audience thinks in credits, the unit they buy and pay in, so that is
 * what is shown. While a run holds credits it shows the exact reserved amount
 * ("using 2…"), read from the live balance rather than a fast-ticking meter, and
 * it decrements after settlement. Tapping it opens the balance, what work costs,
 * and the way to get more.
 */
export function CreditBalance({ signedIn, busy }: { signedIn: boolean; busy: boolean }) {
  const [available, setAvailable] = useState<number | null>(null)
  const [reserved, setReserved] = useState(0)
  const [plan, setPlan] = useState('')
  const [guide, setGuide] = useState<CreditGuide>([])
  // Balance at or below which the pill turns amber and offers a top-up. Same
  // threshold as the low-credit email, so both surfaces agree.
  const [lowThreshold, setLowThreshold] = useState(5)
  const [changed, setChanged] = useState(false)
  const [open, setOpen] = useState(false)
  const previous = useRef<number | null>(null)
  const wasBusy = useRef(busy)

  const load = useCallback(() => {
    if (!signedIn) return
    fetch('/api/credits')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || typeof data.available !== 'number') return
        if (previous.current !== null && data.available !== previous.current) {
          setChanged(true)
          window.setTimeout(() => setChanged(false), 1400)
        }
        previous.current = data.available
        setAvailable(data.available)
        setReserved(typeof data.reserved === 'number' ? data.reserved : 0)
        setPlan(typeof data.plan === 'string' ? data.plan : '')
        if (typeof data.lowThreshold === 'number') setLowThreshold(data.lowThreshold)
        if (Array.isArray(data.guide)) setGuide(data.guide)
      })
      .catch(() => { /* the balance is a nicety, never a blocker */ })
  }, [signedIn])

  // Load once, and refresh when the workspace comes back into focus.
  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // When a run starts it reserves credits; a short delay lets that hold land,
  // then the reserved amount is real. When it ends, settlement is refreshed.
  useEffect(() => {
    if (busy && !wasBusy.current) {
      const timer = window.setTimeout(load, 700)
      wasBusy.current = busy
      return () => window.clearTimeout(timer)
    }
    if (!busy && wasBusy.current) load()
    wasBusy.current = busy
  }, [busy, load])

  // Close the popover on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.credit-balance-wrap')) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!signedIn || available === null) return null

  const holding = busy && reserved > 0
  // A calm nudge before the wall, not a panic: at or below the threshold the
  // pill turns amber and the popover suggests a top-up, so nobody is surprised
  // by a 402 mid-task.
  const low = available <= lowThreshold

  return (
    <span className="credit-balance-wrap">
      <button
        type="button"
        className={`credit-balance${busy ? ' working' : ''}${changed ? ' changed' : ''}${low ? ' low' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${available} credits remaining${holding ? `, using ${reserved} now` : ''}. Open credit details.`}
      >
        <i className="credit-dot" aria-hidden="true" />
        <b>{available}</b>
        <small>{holding ? `using ${reserved}…` : busy ? 'using…' : low ? 'left, add soon' : 'credits'}</small>
      </button>

      {open ? (
        <div className="credit-popover" role="menu">
          <div className="credit-popover-head">
            <span><b>{available}</b> credit{available === 1 ? '' : 's'} left</span>
            {plan ? <span className="credit-plan">{plan} plan</span> : null}
          </div>
          {low ? <p className="credit-low-note">Almost out. A one-time top-up keeps paid work from pausing.</p> : null}
          {reserved > 0 ? <p className="credit-holding">{reserved} reserved for work in progress.</p> : null}
          {guide.length ? (
            <ul className="credit-guide">
              {guide.map((item) => (
                <li key={item.task}><span>{item.task}</span><b>{item.credits}</b></li>
              ))}
            </ul>
          ) : null}
          {/* The full picture — balance, costs, plan and payments — lives on one
              page now, so the popover stays a glance and hands off to it. */}
          <Link href="/settings/billing" className="credit-plans-link" onClick={() => setOpen(false)}>
            Credits and billing <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </span>
  )
}
