'use client'

import { useMemo, useState } from 'react'
import { motion, useSpring, AnimatePresence } from 'motion/react'
import { MarkdownBody, ResponseContent } from '@/components/ResponseContent'
import { splitMarkdownSections, totalReadStats } from '@/lib/markdown-sections'

/** A long generated document, broken into scannable, collapsible sections
 * instead of one continuous scroll. Falls back to the plain flat renderer
 * when there is nothing meaningful to split (short notes, single-idea
 * outputs), so the rail and accordion chrome never show up for a paragraph. */
export function DocumentReader({ content }: { content: string }) {
  const sections = useMemo(() => splitMarkdownSections(content), [content])
  const named = useMemo(() => sections.filter((section) => section.title), [sections])
  const lede = sections.find((section) => !section.title) ?? null
  const { words, minutes } = useMemo(() => totalReadStats(sections), [sections])

  const firstId = named[0]?.id
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(firstId ? [firstId] : []))
  const [activeId, setActiveId] = useState<string | undefined>(firstId)

  // Progress reflects how far through the section rail the reader has
  // scrolled, not raw pixels. It stays correct regardless of which ancestor
  // actually owns the scrollbar, and it means something for an accordion:
  // "how far through" rather than "how many pixels down a variable-height page."
  const activeIndex = Math.max(0, named.findIndex((section) => section.id === activeId))
  const progressTarget = named.length > 0 ? (activeIndex + 1) / named.length : 0
  const progress = useSpring(progressTarget, { stiffness: 260, damping: 32, mass: 0.5 })

  if (named.length < 2) return <ResponseContent content={content} />

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function jumpTo(id: string) {
    setOpenIds((current) => (current.has(id) ? current : new Set(current).add(id)))
    setActiveId(id)
    requestAnimationFrame(() => {
      document.getElementById(`doc-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const allOpen = named.every((section) => openIds.has(section.id))

  return (
    <div className="doc-reader">
      <div className="doc-progress-track">
        <motion.div className="doc-progress-fill" style={{ scaleX: progress }} />
      </div>

      {lede ? (
        <div className="doc-lede response-content">
          <MarkdownBody content={lede.body} />
        </div>
      ) : null}

      <div className="doc-rail-row">
        <div className="doc-rail">
          {named.map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`doc-rail-pill${activeId === section.id ? ' active' : ''}`}
              onClick={() => jumpTo(section.id)}
            >
              {activeId === section.id ? (
                <motion.span
                  className="doc-rail-pill-bg"
                  layoutId="doc-rail-active"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              ) : null}
              <span className="doc-rail-pill-label">
                <em>{String(index + 1).padStart(2, '0')}</em>
                {section.title}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="doc-toggle-all"
          onClick={() => setOpenIds(allOpen ? new Set() : new Set(named.map((section) => section.id)))}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="doc-meta">
        <span>{named.length} sections</span>
        <span aria-hidden="true">·</span>
        <span>~{minutes} min read</span>
        <span aria-hidden="true">·</span>
        <span>{words.toLocaleString()} words</span>
      </div>

      <div className="doc-sections">
        {named.map((section, index) => {
          const open = openIds.has(section.id)
          return (
            <motion.div
              key={section.id}
              id={`doc-section-${section.id}`}
              className={`doc-section${open ? ' open' : ''}`}
              onViewportEnter={() => setActiveId(section.id)}
              viewport={{ margin: '-40% 0px -50% 0px' }}
            >
              <button type="button" className="doc-section-head" onClick={() => toggle(section.id)} aria-expanded={open}>
                <span className="doc-section-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="doc-section-title">{section.title}</span>
                <motion.span
                  className="doc-section-chevron"
                  animate={{ rotate: open ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  aria-hidden="true"
                >
                  &#8250;
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    className="doc-section-body-wrap"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 } }}
                  >
                    <div className="doc-section-body response-content">
                      <MarkdownBody content={section.body} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
