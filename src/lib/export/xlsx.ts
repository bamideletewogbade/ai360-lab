import JSZip from 'jszip'

/**
 * A minimal, dependency-light XLSX writer.
 *
 * An .xlsx file is a zip of XML parts, so the only thing actually needed is a
 * zip container — already in the tree for .docx. Writing the four parts by hand
 * keeps a spreadsheet export from pulling in a large spreadsheet library for
 * what is, in this product, always the same shape: a header row and rows of
 * plain cells.
 *
 * Values are written as numbers when they are unambiguously numeric so that
 * totals and charts work in Excel and Google Sheets, and as inline strings
 * otherwise. Inline strings avoid a shared-string table, which is a meaningful
 * simplification for the sizes involved here.
 */

export type Sheet = {
  name: string
  rows: string[][]
}

/** Excel forbids : \ / ? * [ ] in sheet names, caps them at 31 characters, and rejects empties. */
export function safeSheetName(name: string, fallback: string) {
  const cleaned = (name || '')
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
  return cleaned || fallback
}

/** Sheet names must also be unique within a workbook, case-insensitively. */
export function uniqueSheetNames(names: string[]) {
  const seen = new Set<string>()
  return names.map((name, index) => {
    const base = safeSheetName(name, `Sheet${index + 1}`)
    let candidate = base
    let suffix = 2
    while (seen.has(candidate.toLowerCase())) {
      const room = 31 - String(suffix).length - 1
      candidate = `${base.slice(0, room)} ${suffix}`
      suffix += 1
    }
    seen.add(candidate.toLowerCase())
    return candidate
  })
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // XML 1.0 forbids most control characters outright; strip rather than
    // produce a file Excel refuses to open. Tab, newline and carriage return
    // are the three that are legal, so they survive.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/** A1, B1 … Z1, AA1 … for an arbitrary column index. */
export function cellRef(columnIndex: number, rowNumber: number) {
  let dividend = columnIndex + 1
  let name = ''
  while (dividend > 0) {
    const remainder = (dividend - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    dividend = Math.floor((dividend - remainder - 1) / 26)
  }
  return `${name}${rowNumber}`
}

/**
 * Whether a cell should be written as a number.
 *
 * Deliberately conservative: a value keeps its text form unless it is a plain
 * number. Anything carrying a currency symbol, a thousands separator, a
 * percent sign or a leading zero stays a string, because converting those
 * silently changes what the person wrote — "007" must not become 7, and
 * "GHS 420" must not lose its unit.
 */
export function numericCell(value: string) {
  const trimmed = value.trim()
  if (!trimmed || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function sheetXml(rows: string[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1
      const cells = row
        .map((value, columnIndex) => {
          const reference = cellRef(columnIndex, rowNumber)
          if (value === '' || value === undefined || value === null) return ''
          const numeric = numericCell(value)
          if (numeric !== null) {
            return `<c r="${reference}"><v>${numeric}</v></c>`
          }
          const style = rowIndex === 0 ? ' s="1"' : ''
          return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${rowNumber}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

/** The shape this module needs from the exporter's parsed markdown. */
export type SheetSourceBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: string }

/**
 * Turn parsed markdown into sheets.
 *
 * A spreadsheet is only meaningful where there is tabular data, so prose is
 * skipped rather than flattened into a column of sentences. Each table takes
 * its name from the heading it sits under, which is what makes a multi-table
 * document open as a workbook a person can navigate.
 */
export function sheetsFromBlocks(blocks: SheetSourceBlock[]): Sheet[] {
  const sheets: Sheet[] = []
  let heading = ''
  for (const block of blocks) {
    if (block.type === 'heading' && 'text' in block) {
      heading = block.text
      continue
    }
    if (block.type === 'table' && 'rows' in block && block.rows.length) {
      sheets.push({ name: heading || `Table ${sheets.length + 1}`, rows: block.rows })
    }
  }
  return sheets
}

export async function buildXlsx(sheets: Sheet[]): Promise<Buffer> {
  if (!sheets.length) throw new Error('A spreadsheet needs at least one sheet')
  const names = uniqueSheetNames(sheets.map((sheet) => sheet.name))
  const zip = new JSZip()

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('')}</Types>`,
  )

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join('')}</sheets></workbook>`,
  )

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )

  // One style beyond the default: a bold header row, so an exported table reads
  // as a table rather than an undifferentiated block of cells.
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
  )

  sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows))
  })

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
