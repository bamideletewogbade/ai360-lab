'use client'

import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function polishProse(text: string) {
  const segments = text.split(/(```[\s\S]*?```)/g)
  return segments
    .map((segment) => {
      if (segment.startsWith('```')) return segment
      return segment
        .replace(/(\d)\s*[\u2013]\s*(\d)/g, '$1 to $2')
        .replace(/\s*[\u2013\u2014]\s*/g, ', ')
        .replace(/【\s*\d+\s*†[^】]+】/g, '')
        .replace(/\[\s*(?:source|citation)\s*:?\s*\d+\s*]/gi, '')
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .replace(/,\s*,+/g, ',')
        .replace(/[ \t]{2,}/g, ' ')
    })
    .join('')
    .trim()
}

function cleanLanguageLabel(className?: string) {
  return className?.replace('language-', '').replace(/[^a-z0-9+#.-]/gi, '') || 'code'
}

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = cleanLanguageLabel(className)
  const codeString = Array.isArray(children)
    ? children.join('')
    : typeof children === 'string'
      ? children
      : String(children ?? '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString.replace(/\n$/, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API fails
    }
  }

  return (
    <div className="code-block-card">
      <div className="code-block-header">
        <span className="code-block-lang">{language.toUpperCase()}</span>
        <button
          type="button"
          className={`code-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Copied</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre">
        <code className={className}>{codeString}</code>
      </pre>
    </div>
  )
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
            <blockquote>{children}</blockquote>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ children, className }) => {
            const isInline = !className && typeof children === 'string' && !children.includes('\n')
            if (isInline) {
              return <code className="inline-code">{children}</code>
            }
            return <CodeBlock className={className}>{children}</CodeBlock>
          },
          table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
        }}
      >
        {polishProse(content)}
      </ReactMarkdown>
    </div>
  )
}

