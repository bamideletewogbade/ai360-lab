'use client'

import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

export type ConversationPrompt = {
  id: string
  label: string
}

type ConversationMinimapProps = {
  prompts: ConversationPrompt[]
  scrollRootRef: RefObject<HTMLDivElement | null>
  showReturnToLatest: boolean
  onNavigateBack: () => void
  onReturnToLatest: () => void
}

const MINIMUM_PROMPTS = 5

function messageElement(id: string) {
  return document.getElementById(`message-${id}`)
}

export function ConversationMinimap({
  prompts,
  scrollRootRef,
  showReturnToLatest,
  onNavigateBack,
  onReturnToLatest,
}: ConversationMinimapProps) {
  const [positions, setPositions] = useState<Record<string, number>>({})
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    if (prompts.length < MINIMUM_PROMPTS) return
    const root = scrollRootRef.current
    if (!root) return

    let frame = 0
    let activeFrame = 0
    const measure = () => {
      frame = 0
      const rootRect = root.getBoundingClientRect()
      const scrollRange = Math.max(1, root.scrollHeight - root.clientHeight)
      const nextPositions: Record<string, number> = {}

      for (const prompt of prompts) {
        const element = messageElement(prompt.id)
        if (!element) continue
        const offset = element.getBoundingClientRect().top - rootRect.top + root.scrollTop
        nextPositions[prompt.id] = Math.max(1, Math.min(99, (offset / scrollRange) * 100))
      }
      setPositions(nextPositions)
    }
    const scheduleMeasure = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    const syncActivePrompt = () => {
      activeFrame = 0
      const rootRect = root.getBoundingClientRect()
      const readingLine = rootRect.top + root.clientHeight * 0.28
      let current = observedElements[0]
      for (const element of observedElements) {
        if (element.getBoundingClientRect().top <= readingLine) current = element
        else break
      }
      if (current) setActiveId(current.getAttribute('data-prompt-id') ?? '')
    }
    const scheduleActivePrompt = () => {
      if (activeFrame) return
      activeFrame = window.requestAnimationFrame(syncActivePrompt)
    }

    const observedElements = prompts
      .map((prompt) => messageElement(prompt.id))
      .filter((element): element is HTMLElement => Boolean(element))

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))
        if (visible[0]) setActiveId(visible[0].target.getAttribute('data-prompt-id') ?? '')
        else scheduleActivePrompt()
      },
      { root, rootMargin: '-10% 0px -72% 0px', threshold: 0 },
    )
    observedElements.forEach((element) => intersectionObserver.observe(element))

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    const thread = root.querySelector('.thread')
    if (thread) resizeObserver.observe(thread)
    observedElements.forEach((element) => resizeObserver.observe(element))
    root.addEventListener('scroll', scheduleActivePrompt, { passive: true })
    scheduleMeasure()
    scheduleActivePrompt()

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (activeFrame) window.cancelAnimationFrame(activeFrame)
      root.removeEventListener('scroll', scheduleActivePrompt)
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [prompts, scrollRootRef])

  if (prompts.length < MINIMUM_PROMPTS) return null

  const activeIndex = Math.max(0, prompts.findIndex((prompt) => prompt.id === activeId))
  const activePosition = positions[activeId] ?? ((activeIndex + 1) / (prompts.length + 1)) * 100

  const jumpToPrompt = (id: string) => {
    const target = messageElement(id)
    if (!target) return
    onNavigateBack()
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <nav className="conversation-minimap" aria-label="Prompts in this conversation">
      <div className="conversation-minimap-track" aria-hidden="true" />
      <div className="conversation-minimap-progress" aria-hidden="true" style={{ height: `${activePosition}%` }} />
      {prompts.map((prompt, index) => (
        <button
          type="button"
          className={prompt.id === activeId ? 'active' : ''}
          style={{
            top: `${positions[prompt.id] ?? ((index + 1) / (prompts.length + 1)) * 100}%`,
            '--minimap-order': index,
          } as CSSProperties}
          key={prompt.id}
          aria-label={`Jump to prompt ${index + 1}: ${prompt.label}`}
          aria-current={prompt.id === activeId ? 'location' : undefined}
          onClick={() => jumpToPrompt(prompt.id)}
        >
          <i aria-hidden="true" />
          <span className="conversation-minimap-preview">
            <b>Prompt {index + 1}</b>
            <span>{prompt.label}</span>
          </span>
        </button>
      ))}
      {showReturnToLatest ? (
        <button type="button" className="conversation-return-latest" onClick={onReturnToLatest}>
          <span>Latest</span><i aria-hidden="true">↓</i>
        </button>
      ) : null}
    </nav>
  )
}
