'use client'

import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function removeUnclosedPair(text: string, marker: string) {
  const positions: number[] = []
  let from = 0
  while (true) {
    const index = text.indexOf(marker, from)
    if (index < 0) break
    positions.push(index)
    from = index + marker.length
  }
  if (positions.length % 2 === 0) return text
  const last = positions.at(-1)!
  return `${text.slice(0, last)}${text.slice(last + marker.length)}`
}

function polishProse(text: string) {
  const segments = text.split(/(```[\s\S]*?```)/g)
  return segments
    .map((segment) => {
      if (segment.startsWith('```')) return segment
      let clean = segment
        .replace(/(\d)\s*[–]\s*(\d)/g, '$1 to $2')
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/【\s*\d+\s*†[^】]+】/g, '')
        .replace(/\[\s*(?:source|citation)\s*:?\s*\d+\s*]/gi, '')
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .replace(/,\s*,+/g, ',')
        .replace(/[ \t]{2,}/g, ' ')
      clean = removeUnclosedPair(clean, '**')
      clean = removeUnclosedPair(clean, '__')
      return clean
    })
    .join('')
    .trim()
}

function cleanLanguageLabel(className?: string) {
  return className?.replace('language-', '').replace(/[^a-z0-9+#.-]/gi, '') || 'code'
}

export function ResponseContent({ content }: { content: string }) {
  return (
    <div className="response-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h3>{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
              <span className="external-mark" aria-hidden="true">↗</span>
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote><span className="quote-spark" aria-hidden="true">✦</span>{children}</blockquote>
          ),
          code: ({ children, className }) => (
            <code className={className} data-language={cleanLanguageLabel(className)}>
              {children as ReactNode}
            </code>
          ),
          table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
        }}
      >
        {polishProse(content)}
      </ReactMarkdown>
      <span className="response-finish" aria-hidden="true">✦</span>
    </div>
  )
}
