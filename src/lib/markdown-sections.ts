export type MarkdownSection = {
  id: string
  title: string | null
  body: string
}

function slugify(title: string, seen: Map<string, number>) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function wordCount(text: string) {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}

/**
 * Splits a document into its top-level (h2) sections. Content before the
 * first h2 becomes a section with a null title, so it can be rendered as an
 * always-visible lede rather than folded into an accordion.
 */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split('\n')
  const sections: MarkdownSection[] = []
  const seen = new Map<string, number>()
  let currentTitle: string | null = null
  let currentId = 'overview'
  let buffer: string[] = []
  let inFence = false

  const flush = () => {
    const body = buffer.join('\n').trim()
    if (body) sections.push({ id: currentId, title: currentTitle, body })
    buffer = []
  }

  for (const line of lines) {
    if (/^```/.test(line.trim())) inFence = !inFence
    const heading = !inFence && /^##\s+(.+?)\s*#*$/.exec(line)
    if (heading) {
      flush()
      currentTitle = heading[1].trim()
      currentId = slugify(currentTitle, seen)
      continue
    }
    buffer.push(line)
  }
  flush()

  return sections
}

export function totalReadStats(sections: MarkdownSection[]) {
  const words = sections.reduce((sum, section) => sum + wordCount(section.body), 0)
  const minutes = Math.max(1, Math.round(words / 200))
  return { words, minutes }
}
