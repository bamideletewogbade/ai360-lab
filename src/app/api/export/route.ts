import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export const runtime = 'nodejs'

type ExportBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph' | 'quote' | 'code'; text: string }
  | { type: 'bullet' | 'number'; items: string[] }
  | { type: 'table'; rows: string[][] }

function cleanText(text: string) {
  return text
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/[*_`~]/g, '')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/ã€\s*\d+\s*â€ [^ã€‘]+ã€‘/g, '')
    .trim()
}

function parseMarkdown(markdown: string): ExportBlock[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const blocks: ExportBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++])
      index++
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: Math.min(3, heading[1].length), text: cleanText(heading[2]) })
      index++
      continue
    }
    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]+/.test(lines[index + 1])
    ) {
      const rows: string[][] = []
      rows.push(line.split('|').map(cleanText).filter(Boolean))
      index += 2
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(lines[index].split('|').map(cleanText).filter(Boolean))
        index++
      }
      if (rows.length && rows[0].length) blocks.push({ type: 'table', rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(cleanText(lines[index].replace(/^\s*[-*]\s+/, '')))
        index++
      }
      blocks.push({ type: 'bullet', items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(cleanText(lines[index].replace(/^\s*\d+\.\s+/, '')))
        index++
      }
      blocks.push({ type: 'number', items })
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(cleanText(lines[index].replace(/^\s*>\s?/, '')))
        index++
      }
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[index]) &&
      !/^\s*>/.test(lines[index]) &&
      !lines[index].trim().startsWith('```')
    ) {
      paragraph.push(cleanText(lines[index]))
      index++
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

function safeFilename(title: string, extension: string) {
  const base = cleanText(title || 'AI360 response')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .toLowerCase()
  return `${base || 'ai-360-response'}.${extension}`
}

async function buildDocx(title: string, blocks: ExportBlock[]) {
  const logo = await readFile(path.join(process.cwd(), 'public', 'icon-mark-black.png'))
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: 'AI360', bold: true, size: 18, font: 'Arial', color: '56595C' })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: cleanText(title), bold: true, size: 42, font: 'Arial', color: '101112' })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 300 },
      children: [
        new TextRun({
          text: `Prepared ${new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date())}`,
          size: 18,
          font: 'Arial',
          color: '56595C',
        }),
      ],
    }),
  ]

  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(
        new Paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: block.level === 1 ? 280 : 220, after: 100 },
          children: [new TextRun({ text: block.text, bold: true, font: 'Arial', color: '101112' })],
        }),
      )
    } else if (block.type === 'paragraph') {
      children.push(
        new Paragraph({
          spacing: { before: 0, after: 120, line: 280 },
          children: [new TextRun({ text: block.text, size: 22, font: 'Arial', color: '292B2D' })],
        }),
      )
    } else if (block.type === 'quote') {
      children.push(
        new Paragraph({
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '101112', space: 12 } },
          shading: { type: ShadingType.CLEAR, fill: 'F1F0EC' },
          indent: { left: 240, right: 160 },
          spacing: { before: 100, after: 160, line: 280 },
          children: [new TextRun({ text: block.text, italics: true, size: 21, font: 'Arial', color: '292B2D' })],
        }),
      )
    } else if (block.type === 'code') {
      children.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: '101112' },
          spacing: { before: 100, after: 160, line: 260 },
          children: [new TextRun({ text: block.text, size: 18, font: 'Consolas', color: 'F7F6F2' })],
        }),
      )
    } else if (block.type === 'bullet' || block.type === 'number') {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            ...(block.type === 'bullet'
              ? { bullet: { level: 0 } }
              : { numbering: { reference: 'ai360-numbering', level: 0 } }),
            spacing: { before: 0, after: 100, line: 280 },
            children: [new TextRun({ text: item, size: 22, font: 'Arial', color: '292B2D' })],
          }),
        )
      }
    } else if (block.type === 'table') {
      const columns = Math.max(1, block.rows[0]?.length || 1)
      const width = Math.floor(9360 / columns)
      children.push(
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: Array.from({ length: columns }, () => width),
          rows: block.rows.map(
            (row, rowIndex) =>
              new TableRow({
                tableHeader: rowIndex === 0,
                children: Array.from({ length: columns }, (_, columnIndex) =>
                  new TableCell({
                    width: { size: width, type: WidthType.DXA },
                    shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: 'F1F0EC' } : undefined,
                    margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    children: [
                      new Paragraph({
                        spacing: { after: 0 },
                        children: [
                          new TextRun({
                            text: row[columnIndex] || '',
                            bold: rowIndex === 0,
                            size: rowIndex === 0 ? 19 : 20,
                            font: 'Arial',
                            color: '292B2D',
                          }),
                        ],
                      }),
                    ],
                  }),
                ),
              }),
          ),
        }),
      )
      children.push(new Paragraph({ spacing: { after: 80 } }))
    }
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: 'ai360-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22, color: '292B2D' } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Arial', size: 32, bold: true, color: '101112' },
          paragraph: { spacing: { before: 320, after: 140 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Arial', size: 26, bold: true, color: '101112' },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Arial', size: 23, bold: true, color: '292B2D' },
          paragraph: { spacing: { before: 180, after: 80 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({ data: logo, transformation: { width: 18, height: 21 }, type: 'png' }),
                  new TextRun({ text: '   AI THREE SIXTY', bold: true, size: 16, font: 'Arial', color: '56595C' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Created with AI360   |   ', size: 16, font: 'Arial', color: '777777' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '777777' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(document)
}

type PdfState = { page: PDFPage; y: number }

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

async function buildPdf(title: string, blocks: ExportBlock[]) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const mono = await pdf.embedFont(StandardFonts.Courier)
  const logoBytes = await readFile(path.join(process.cwd(), 'public', 'icon-mark-black.png'))
  const logo = await pdf.embedPng(logoBytes)
  const margin = 58
  const width = 612 - margin * 2
  const states: PdfState[] = []

  const addPage = () => {
    const page = pdf.addPage([612, 792])
    page.drawImage(logo, { x: margin, y: 744, width: 17, height: 20 })
    page.drawText('AI THREE SIXTY', { x: margin + 25, y: 749, size: 8, font: bold, color: rgb(.34, .35, .36) })
    const state = { page, y: 716 }
    states.push(state)
    return state
  }
  let state = addPage()
  const ensure = (height: number) => {
    if (state.y - height < 58) state = addPage()
  }
  const drawWrapped = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {},
  ) => {
    const font = options.font || regular
    const size = options.size || 10.5
    const indent = options.indent || 0
    const lines = wrapText(text, font, size, width - indent)
    const lineHeight = size * 1.42
    ensure(lines.length * lineHeight + (options.gap || 8))
    for (const line of lines) {
      state.page.drawText(line, { x: margin + indent, y: state.y, size, font, color: options.color || rgb(.16, .17, .18) })
      state.y -= lineHeight
    }
    state.y -= options.gap ?? 8
  }

  drawWrapped(cleanText(title), { font: bold, size: 22, color: rgb(.06, .07, .07), gap: 5 })
  drawWrapped(`Prepared ${new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date())}`, {
    size: 8.5,
    color: rgb(.34, .35, .36),
    gap: 22,
  })

  for (const block of blocks) {
    if (block.type === 'heading') {
      drawWrapped(block.text, { font: bold, size: block.level === 1 ? 15 : block.level === 2 ? 12.5 : 11, gap: 8 })
    } else if (block.type === 'paragraph') {
      drawWrapped(block.text)
    } else if (block.type === 'quote') {
      ensure(52)
      state.page.drawRectangle({ x: margin, y: state.y - 30, width: 2, height: 38, color: rgb(.06, .07, .07) })
      drawWrapped(block.text, { font: italic, indent: 16, color: rgb(.25, .26, .27), gap: 14 })
    } else if (block.type === 'code') {
      const lines = block.text.split('\n')
      const height = Math.max(45, lines.length * 11 + 24)
      ensure(height + 12)
      const blockTop = state.y
      state.page.drawRectangle({ x: margin, y: blockTop - height + 8, width, height, color: rgb(.06, .07, .07) })
      state.y = blockTop - 10
      for (const line of lines) {
        state.page.drawText(line.slice(0, 78), { x: margin + 12, y: state.y, size: 8, font: mono, color: rgb(.97, .96, .95) })
        state.y -= 11
      }
      state.y = blockTop - height - 10
    } else if (block.type === 'bullet' || block.type === 'number') {
      block.items.forEach((item, itemIndex) => {
        drawWrapped(`${block.type === 'bullet' ? 'â€¢' : `${itemIndex + 1}.`}  ${item}`, { indent: 8, gap: 4 })
      })
      state.y -= 5
    } else if (block.type === 'table') {
      const flattened = block.rows.map((row) => row.join('  |  '))
      ensure(flattened.length * 23 + 10)
      flattened.forEach((row, rowIndex) => {
        const lines = wrapText(row, rowIndex === 0 ? bold : regular, 8.5, width - 16)
        const height = Math.max(23, lines.length * 11 + 10)
        state.page.drawRectangle({
          x: margin,
          y: state.y - height + 6,
          width,
          height,
          color: rowIndex === 0 ? rgb(.94, .93, .91) : rgb(1, 1, 1),
          borderColor: rgb(.86, .85, .82),
          borderWidth: .6,
        })
        let rowY = state.y - 6
        lines.forEach((line) => {
          state.page.drawText(line, { x: margin + 8, y: rowY, size: 8.5, font: rowIndex === 0 ? bold : regular, color: rgb(.16, .17, .18) })
          rowY -= 11
        })
        state.y -= height
      })
      state.y -= 12
    }
  }

  states.forEach((item, pageIndex) => {
    item.page.drawText(`Created with AI360   |   ${pageIndex + 1} of ${states.length}`, {
      x: 410,
      y: 31,
      size: 7.5,
      font: regular,
      color: rgb(.48, .49, .5),
    })
  })
  return Buffer.from(await pdf.save())
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/export')
  const startedAt = performance.now()
  const tooLarge = rejectLargeRequest(request, 250_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const limited = rateLimit(request, 'export', { minute: 15, daily: 80 }, await resolveRequester(request))
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: { title?: string; content?: string; format?: string }
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  const title = cleanText(body.title || 'AI360 response').slice(0, 140)
  const content = typeof body.content === 'string' ? body.content.slice(0, 100_000) : ''
  if (!content) {
    log.finish(400, { outcome: 'missing_content' })
    return Response.json({ error: 'Nothing to export', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  const blocks = parseMarkdown(content)

  try {
    log.info('export.started', {
      format: body.format,
      inputCharacters: content.length,
      blockCount: blocks.length,
    })
    if (body.format === 'docx') {
      const file = await buildDocx(title, blocks)
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/export', feature: 'export.docx',
        latencyMs: Math.round(performance.now() - startedAt), outcome: 'success',
        metadata: { inputCharacters: content.length, outputBytes: file.byteLength },
      })
      log.finish(200, { outcome: 'success', format: 'docx', outputBytes: file.byteLength })
      return new Response(new Uint8Array(file), {
        headers: log.headers({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeFilename(title, 'docx')}"`,
          'Cache-Control': 'no-store',
        }),
      })
    }
    if (body.format === 'pdf') {
      const file = await buildPdf(title, blocks)
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/export', feature: 'export.pdf',
        latencyMs: Math.round(performance.now() - startedAt), outcome: 'success',
        metadata: { inputCharacters: content.length, outputBytes: file.byteLength },
      })
      log.finish(200, { outcome: 'success', format: 'pdf', outputBytes: file.byteLength })
      return new Response(new Uint8Array(file), {
        headers: log.headers({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeFilename(title, 'pdf')}"`,
          'Cache-Control': 'no-store',
        }),
      })
    }
    log.finish(400, { outcome: 'unsupported_format', format: body.format })
    return Response.json({ error: 'Unsupported format', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  } catch (error) {
    log.error('export.failed', { format: body.format, ...errorDetails(error) })
    log.finish(500, { outcome: 'generation_error', format: body.format })
    return Response.json({
      error: 'The document could not be created',
      requestId: log.requestId,
    }, { status: 500, headers: log.headers() })
  }
}
