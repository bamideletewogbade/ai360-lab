/**
 * Turns an operator's participant list into rows the invitation table can hold.
 *
 * The input is whatever an operator could plausibly have to hand: a CSV saved
 * out of Excel, or a block of addresses pasted from a document or a mail
 * client. Both arrive messy — a byte-order mark from Excel, semicolon
 * delimiters from a non-English locale, `Name <address>` pairs copied out of a
 * mail app, trailing punctuation from a numbered list.
 *
 * Nothing here touches the database or the network. Classification that needs
 * to know whether an address is already a user, already invited, or suppressed
 * belongs to the import route; this module's job is to produce clean, deduped,
 * line-attributed rows and to say precisely which input lines it could not use.
 * Keeping it pure also means the console can preview a paste without a
 * round-trip.
 */

/** Beyond this the operator should be splitting the work into batches anyway. */
export const MAX_IMPORT_ROWS = 500

/** Practical address bounds. The RFC allows more; no real mailbox uses it. */
const MAX_EMAIL_LENGTH = 254
const MAX_LOCAL_PART_LENGTH = 64

/**
 * Deliberately stricter than the RFC. An address that needs quoting or a
 * bracketed IP literal is far more likely to be a mangled paste than a mailbox
 * an operator means to reach, and a false accept costs a bounce.
 */
const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/

/** `Display Name <address@example.com>`, as pasted out of a mail client. */
const ANGLE_ADDRESSED = /^(.*?)<([^<>]+)>$/

const EMAIL_HEADERS = new Set(['email', 'e-mail', 'email address', 'e-mail address', 'mail', 'address'])
const NAME_HEADERS = new Set(['name', 'full name', 'display name', 'participant', 'participant name', 'first name'])
const COHORT_HEADERS = new Set(['cohort', 'cohort key', 'group', 'team'])

export type ParticipantImportFormat = 'csv' | 'list'

export type ParticipantImportIssueReason =
  | 'invalid_email'
  | 'duplicate_in_file'
  | 'missing_email'

export type ParsedParticipantRow = {
  email: string
  displayName: string | null
  cohortKey: string | null
  /** 1-based line in the operator's input, so a bad row can be pointed at. */
  line: number
}

export type ParticipantImportIssue = {
  line: number
  raw: string
  reason: ParticipantImportIssueReason
}

export type ParticipantImportParse = {
  format: ParticipantImportFormat
  rows: ParsedParticipantRow[]
  issues: ParticipantImportIssue[]
  /** True when the input exceeded MAX_IMPORT_ROWS and the tail was dropped. */
  truncated: boolean
}

/** Excel writes a UTF-8 BOM; left in place it corrupts the first header cell. */
function stripBom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

function collapseSpace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Excel exports use the list separator of the machine's locale, so the same
 * "CSV" is comma-separated in one office and semicolon-separated in the next.
 * Whichever candidate appears most often in the header line wins.
 */
function detectDelimiter(headerLine: string) {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * RFC 4180 parsing: quoted fields may contain the delimiter and newlines, and a
 * doubled quote inside a quoted field is a literal quote. Records carry the
 * line they started on so issues can be reported against the operator's file
 * rather than against an index into our own array.
 */
function parseDelimited(text: string, delimiter: string) {
  const records: Array<{ cells: string[]; line: number }> = []
  let cells: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let touched = false

  const endField = () => {
    cells.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    if (touched) records.push({ cells, line: recordLine })
    cells = []
    touched = false
    recordLine = line
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        if (char === '\n') line += 1
        field += char
      }
      touched = true
      continue
    }
    if (char === '"') {
      quoted = true
      touched = true
      continue
    }
    if (char === delimiter) {
      endField()
      touched = true
      continue
    }
    if (char === '\r') continue
    if (char === '\n') {
      // Counted before the record closes, so `endRecord` still stamps the
      // record with the line it began on and starts the next one at this line.
      line += 1
      endRecord()
      continue
    }
    if (char.trim()) touched = true
    field += char
  }
  endRecord()
  return records
}

function normalizeHeader(value: string) {
  return collapseSpace(value).toLowerCase().replace(/[_.]/g, ' ')
}

/**
 * A first record is a header only if one of its cells names an email column.
 * Without this a headerless file would silently lose its first participant.
 */
function headerIndexes(cells: string[]) {
  const normalized = cells.map(normalizeHeader)
  const email = normalized.findIndex((cell) => EMAIL_HEADERS.has(cell))
  if (email < 0) return null
  return {
    email,
    name: normalized.findIndex((cell) => NAME_HEADERS.has(cell)),
    cohort: normalized.findIndex((cell) => COHORT_HEADERS.has(cell)),
  }
}

/**
 * Reduces one cell to a bare address, or null when it plainly is not one.
 *
 * Handles the shapes a paste actually produces: `mailto:` prefixes from a
 * copied link, `Name <address>` from a mail client, angle brackets on their
 * own, and the comma or semicolon left behind when an address is lifted out of
 * a sentence or a numbered list.
 */
export function normalizeEmail(value: string): string | null {
  let candidate = collapseSpace(stripBom(value))
  if (!candidate) return null

  const addressed = candidate.match(ANGLE_ADDRESSED)
  if (addressed) candidate = addressed[2].trim()

  candidate = candidate.replace(/^mailto:/i, '').trim()
  candidate = candidate.replace(/^[<("']+/, '').replace(/[>)"']+$/, '')
  // Trailing list punctuation, but never a trailing dot that is part of a TLD
  // we would then have to guess at — an address ending in `.` is malformed.
  candidate = candidate.replace(/[,;]+$/, '').trim()
  if (!candidate) return null

  const lowered = candidate.toLowerCase()
  if (lowered.length > MAX_EMAIL_LENGTH) return null
  const at = lowered.lastIndexOf('@')
  if (at < 1 || lowered.length - at > MAX_EMAIL_LENGTH - 1) return null
  if (at > MAX_LOCAL_PART_LENGTH) return null
  if (!EMAIL_PATTERN.test(lowered)) return null
  if (lowered.includes('..')) return null
  // A local part cannot open or close on a dot, and the pattern's character
  // class is too permissive to say so on its own.
  const local = lowered.slice(0, at)
  if (local.startsWith('.') || local.endsWith('.')) return null
  return lowered
}

/**
 * Removes quotes that wrap a whole name, and only those. Stripping any edge
 * quote would eat the closing quote of a name that legitimately ends in one,
 * such as `Lovelace, Ada "Countess"`.
 */
function unwrapQuotes(value: string) {
  const matched = value.match(/^"(.*)"$/s) || value.match(/^'(.*)'$/s)
  return matched ? matched[1] : value
}

/** The display name half of `Name <address>`, when the paste carried one. */
function nameFromAddressed(value: string): string | null {
  const addressed = collapseSpace(value).match(ANGLE_ADDRESSED)
  if (!addressed) return null
  const name = unwrapQuotes(addressed[1].trim()).trim()
  return name ? name.slice(0, 120) : null
}

function cleanName(value: string | undefined): string | null {
  if (!value) return null
  const name = unwrapQuotes(collapseSpace(value)).trim()
  return name ? name.slice(0, 120) : null
}

function cleanCohort(value: string | undefined): string | null {
  if (!value) return null
  const cohort = collapseSpace(value)
  return cohort.length >= 2 && cohort.length <= 120 ? cohort : null
}

/**
 * A pasted block, where every line is an address or a `Name <address>` pair.
 * Lines may also hold several addresses separated by commas, semicolons or
 * spaces, which is what copying a mail client's To: field produces.
 */
function tokenizeList(line: string) {
  if (ANGLE_ADDRESSED.test(collapseSpace(line))) return [line]
  return line.split(/[,;\s]+/).filter(Boolean)
}

export function parseParticipantList(input: string): ParticipantImportParse {
  const text = stripBom(input || '')
  const rows: ParsedParticipantRow[] = []
  const issues: ParticipantImportIssue[] = []
  const seen = new Set<string>()
  let truncated = false

  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = detectDelimiter(firstLine)
  const records = parseDelimited(text, delimiter)
  const header = records.length ? headerIndexes(records[0].cells) : null
  const format: ParticipantImportFormat = header ? 'csv' : 'list'
  const body = header ? records.slice(1) : records

  /** Shared by both formats so a duplicate is reported identically. */
  const accept = (email: string, displayName: string | null, cohortKey: string | null, line: number, raw: string) => {
    if (seen.has(email)) {
      issues.push({ line, raw: raw.slice(0, 200), reason: 'duplicate_in_file' })
      return
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true
      return
    }
    seen.add(email)
    rows.push({ email, displayName, cohortKey, line })
  }

  for (const record of body) {
    if (truncated) break
    const raw = record.cells.join(delimiter)

    if (header) {
      const cell = record.cells[header.email] ?? ''
      if (!collapseSpace(cell)) {
        // A wholly empty row is Excel padding, not an operator mistake.
        if (record.cells.some((value) => collapseSpace(value))) {
          issues.push({ line: record.line, raw: raw.slice(0, 200), reason: 'missing_email' })
        }
        continue
      }
      const email = normalizeEmail(cell)
      if (!email) {
        issues.push({ line: record.line, raw: raw.slice(0, 200), reason: 'invalid_email' })
        continue
      }
      const named = header.name >= 0 ? cleanName(record.cells[header.name]) : null
      accept(
        email,
        named || nameFromAddressed(cell),
        header.cohort >= 0 ? cleanCohort(record.cells[header.cohort]) : null,
        record.line,
        raw,
      )
      continue
    }

    // Headerless input: every cell of every record is an address candidate, so
    // a comma-separated single line works the same as one address per line.
    for (const cell of record.cells) {
      if (truncated) break
      for (const token of tokenizeList(cell)) {
        if (truncated) break
        const email = normalizeEmail(token)
        if (!email) {
          issues.push({ line: record.line, raw: token.slice(0, 200), reason: 'invalid_email' })
          continue
        }
        accept(email, nameFromAddressed(token), null, record.line, token)
      }
    }
  }

  return { format, rows, issues, truncated }
}
