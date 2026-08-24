const PILOT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PILOT_COHORT = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/

export const DEFAULT_PILOT_CREDITS = 100
export const MAX_PILOT_CREDITS_PER_USER = 10_000
export const MAX_PILOT_BATCH_SIZE = 100

export type PilotCreditRow = {
  rowNumber: number
  email: string
  credits: number
}

function parseCsvRows(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) throw new Error('CSV contains a quote inside an unquoted field')
      quoted = true
      continue
    }
    if (character === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += character
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field')
  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function checkedCredits(value: unknown, label: string) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a whole number`)
  const credits = Number(text)
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > MAX_PILOT_CREDITS_PER_USER) {
    throw new Error(`${label} must be between 1 and ${MAX_PILOT_CREDITS_PER_USER}`)
  }
  return credits
}

export function normalizePilotEmail(value: string) {
  return value.trim().toLowerCase()
}

export function normalizePilotCohort(value: string) {
  const cohort = value.trim().toLowerCase()
  if (!PILOT_COHORT.test(cohort)) {
    throw new Error('Cohort must be 1-64 lowercase letters, numbers, underscores or hyphens')
  }
  return cohort
}

export function pilotGrantIdempotencyKey(cohort: string) {
  return `pilot:${normalizePilotCohort(cohort)}`
}

export function parsePilotCreditCsv(
  input: string,
  options: { defaultCredits?: number; maxUsers?: number } = {},
): PilotCreditRow[] {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ''))
  if (!rows.length) throw new Error('CSV is empty')

  const headers = rows[0].map((header) => header.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names')
  const emailIndex = headers.indexOf('email')
  const creditsIndex = headers.indexOf('credits')
  if (emailIndex === -1) throw new Error('CSV must contain an email column')

  const defaultCredits = checkedCredits(
    options.defaultCredits ?? DEFAULT_PILOT_CREDITS,
    'Default credits',
  )
  const maxUsers = options.maxUsers ?? MAX_PILOT_BATCH_SIZE
  const seen = new Map<string, number>()
  const parsed: PilotCreditRow[] = []

  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1
    const email = normalizePilotEmail(rows[index][emailIndex] ?? '')
    if (!email || email.length > 320 || !PILOT_EMAIL.test(email)) {
      throw new Error(`Row ${rowNumber} has an invalid email address`)
    }
    const duplicateRow = seen.get(email)
    if (duplicateRow) throw new Error(`Rows ${duplicateRow} and ${rowNumber} repeat ${email}`)
    seen.set(email, rowNumber)

    const rawCredits = creditsIndex === -1 ? '' : (rows[index][creditsIndex] ?? '').trim()
    parsed.push({
      rowNumber,
      email,
      credits: rawCredits ? checkedCredits(rawCredits, `Row ${rowNumber} credits`) : defaultCredits,
    })
  }

  if (!parsed.length) throw new Error('CSV has no pilot users')
  if (!Number.isSafeInteger(maxUsers) || maxUsers < 1 || parsed.length > maxUsers) {
    throw new Error(`Pilot batch must contain between 1 and ${maxUsers} users`)
  }
  return parsed
}
