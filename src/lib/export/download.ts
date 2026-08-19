export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx'

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
}

/**
 * Whether a spreadsheet is worth offering for this content.
 *
 * The exporter builds a sheet per markdown table, so without one there is
 * nothing to put in a grid. Checking here lets the option be hidden rather than
 * offered and then refused, which is the difference between a considered menu
 * and a dead end.
 */
export function hasTabularContent(markdown: string) {
  const lines = markdown.replace(/\r/g, '').split('\n')
  return lines.some((line, index) =>
    line.includes('|')
    && index + 1 < lines.length
    && /^\s*\|?[\s:|-]+\|[\s:|-]+/.test(lines[index + 1]),
  )
}

/**
 * Ask the server for a document and hand it to the browser.
 *
 * The file is built server-side so both surfaces produce byte-identical,
 * branded output, and so a phone does not have to run a document library over
 * a metered connection.
 */
export async function downloadDocument(input: {
  title: string
  content: string
  format: ExportFormat
  requestId?: string
  /** The project this content belongs to, if any — its brand colours take precedence over the workspace default. */
  projectId?: string
}) {
  const reference = input.requestId
    || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': reference },
    body: JSON.stringify({ title: input.title, content: input.content, format: input.format, projectId: input.projectId || undefined }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({} as { error?: string; requestId?: string }))
    const traced = detail.requestId || response.headers.get('X-Request-Id') || reference
    throw new Error(`${detail.error || 'The document could not be created.'} Reference: ${traced}`)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `ai360-document.${input.format}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return filename
}
