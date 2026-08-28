import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(outputDir, '..', '..')
const requireFromProject = createRequire(path.join(projectRoot, 'package.json'))
const postgres = requireFromProject('postgres')
const { config } = requireFromProject('dotenv')
config({ path: path.join(projectRoot, '.env.local'), quiet: true })

const sources = [
  'C:/Users/HP/Downloads/ai360-free-intro-2026-08-28.csv',
  'C:/Users/HP/Downloads/ai360-free-intro-2026-08-28 (1).csv',
  'C:/Users/HP/Downloads/ai360-free-intro-2026-08-28 (2).csv',
]

const rows = []
for (const source of sources) {
  const imported = await Workbook.fromCSV(await fs.readFile(source, 'utf8'), { sheetName: 'Source' })
  const values = imported.worksheets.getItem('Source').getUsedRange(true).values
  const headers = values[0].map((value) => String(value || '').trim())
  for (const valuesRow of values.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, valuesRow[index]]))
    if (record.Email) rows.push(record)
  }
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: 'require' })
let invitations
try {
  invitations = await sql`
    select email, display_name, invite_status, send_attempts, starting_credits,
           cohort_key, sent_at, accepted_at
      from public.lab_admin_invitations
     where program_key = 'pilot'
       and email = any(${rows.map((row) => String(row.Email).trim().toLowerCase())})`
} finally {
  await sql.end()
}
const invitationByEmail = new Map(invitations.map((row) => [row.email, row]))

const campaignRows = rows
  .map((row) => {
    const email = String(row.Email).trim().toLowerCase()
    const invitation = invitationByEmail.get(email)
    const accepted = invitation?.invite_status === 'accepted'
    return [
      String(row.Name || '').trim(),
      email,
      String(row.Session || '').trim(),
      String(row.Status || '').trim(),
      String(row.Mode || '').trim(),
      invitation?.invite_status || 'not invited',
      Number(invitation?.send_attempts || 0),
      invitation?.display_name ? 'Stored' : invitation ? 'Repair from export' : 'Use export name',
      accepted ? 'Do not email' : invitation ? 'Resend concise invite' : 'Create and send invite',
      120,
      accepted ? Number(invitation.starting_credits || 0) : 0,
      accepted
        ? 'Accepted already; preserve their account and existing grant.'
        : invitation?.starting_credits
          ? `Normalize the unused ${Number(invitation.starting_credits)}-credit top-up to 0; the 120-credit pilot allowance is separate.`
          : 'No additional top-up. The sponsored Everyday pilot allowance supplies 120 credits.',
    ]
  })
  .sort((left, right) => String(left[2]).localeCompare(String(right[2])) || String(left[0]).localeCompare(String(right[0])))

const workbook = Workbook.create()
const summary = workbook.worksheets.add('Campaign summary')
const campaign = workbook.worksheets.add('Recipients')
const credits = workbook.worksheets.add('Credit scenarios')
const email = workbook.worksheets.add('Email copy')

summary.showGridLines = false
summary.getRange('A1:F1').merge()
summary.getRange('A1').values = [['AI360 pilot invitation campaign — 28 August 2026']]
summary.getRange('A1:F1').format = { fill: '#17231C', font: { bold: true, color: '#FFFFFF', size: 16 }, rowHeight: 30 }
summary.getRange('A3:B8').values = [
  ['Measure', 'Count'],
  ['Unique exported registrants', 60],
  ['Already accepted', null],
  ['Concise resends', null],
  ['New invitations', null],
  ['Messages in final send set', null],
]
summary.getRange('B5').formulas = [[`=COUNTIF(Recipients!$F$2:$F$61,"accepted")`]]
summary.getRange('B6').formulas = [[`=COUNTIF(Recipients!$I$2:$I$61,"Resend concise invite")`]]
summary.getRange('B7').formulas = [[`=COUNTIF(Recipients!$I$2:$I$61,"Create and send invite")`]]
summary.getRange('B8').formulas = [['=B6+B7']]
summary.getRange('A3:B3').format = { fill: '#DDE9E0', font: { bold: true, color: '#17231C' }, borders: { preset: 'all', style: 'thin', color: '#B8C8BD' } }
summary.getRange('A4:B8').format.borders = { preset: 'all', style: 'thin', color: '#D8DED9' }
summary.getRange('A10:F10').merge()
summary.getRange('A10').values = [['Credit decision']]
summary.getRange('A10:F10').format = { fill: '#C9853D', font: { bold: true, color: '#FFFFFF', size: 13 } }
summary.getRange('A11:F14').values = [
  ['Recommended account allowance', 120, 'credits', 'Included by the sponsored Everyday pilot entitlement', null, null],
  ['Additional starting-credit field', 0, 'credits', 'Use zero; this field is additive and would otherwise inflate the grant', null, null],
  ['Global provider-spend ceiling', 20, 'USD', 'The production ceiling remains the true cash-risk guardrail', null, null],
  ['Known exception', 1, 'accepted account', 'One participant accepted yesterday with the extra 20-credit top-up; leave that account untouched', null, null],
]
summary.getRange('A16:F18').merge(true)
summary.getRange('A16').values = [['Source note: the exports confirm registration, not attendance. The email therefore says “You registered” and does not claim the recipient attended.']]
summary.getRange('A16:F18').format = { fill: '#FFF4E6', font: { color: '#6B421C' }, wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#E4B77E' } }
summary.getRange('A1:F18').format.wrapText = true
summary.getRange('A1:F18').format.autofitRows()
summary.getRange('A:A').format.columnWidth = 31
summary.getRange('B:B').format.columnWidth = 14
summary.getRange('C:C').format.columnWidth = 13
summary.getRange('D:F').format.columnWidth = 26

const campaignHeaders = ['Name', 'Email', 'Session', 'Registration status', 'Mode', 'Invitation status', 'Send attempts', 'Name handling', 'Campaign action', 'Pilot allowance', 'Additional credits', 'Operational note']
campaign.getRange(`A1:L${campaignRows.length + 1}`).values = [campaignHeaders, ...campaignRows]
campaign.getRange('A1:L1').format = { fill: '#17231C', font: { bold: true, color: '#FFFFFF' }, wrapText: true, borders: { preset: 'all', style: 'thin', color: '#405148' } }
campaign.getRange(`A2:L${campaignRows.length + 1}`).format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: '#E0E5E1' } }
campaign.getRange(`J2:K${campaignRows.length + 1}`).setNumberFormat('0')
campaign.getRange('A:A').format.columnWidth = 24
campaign.getRange('B:B').format.columnWidth = 31
campaign.getRange('C:C').format.columnWidth = 38
campaign.getRange('D:F').format.columnWidth = 18
campaign.getRange('G:G').format.columnWidth = 12
campaign.getRange('H:I').format.columnWidth = 23
campaign.getRange('J:K').format.columnWidth = 14
campaign.getRange('L:L').format.columnWidth = 58
campaign.freezePanes.freezeRows(1)
campaign.tables.add(`A1:L${campaignRows.length + 1}`, true, 'CampaignRecipients')

credits.getRange('A1:F1').merge()
credits.getRange('A1').values = [['Credit scenarios for 60 invitees']]
credits.getRange('A1:F1').format = { fill: '#17231C', font: { bold: true, color: '#FFFFFF', size: 15 } }
credits.getRange('A3:F8').values = [
  ['Credits per person', 'People', 'Total credits', 'Worst-case provider budget (USD)', 'Reference AI value (GH₵)', 'Interpretation'],
  [10, 60, null, null, null, 'Very small trial'],
  [15, 60, null, null, null, 'Conservative guaranteed pool under the $20 cap'],
  [20, 60, null, null, null, 'The intended top-up used yesterday; already slightly above $20 worst case'],
  [120, 60, null, null, null, 'Current included Everyday pilot allowance'],
  [140, 60, null, null, null, 'What yesterday’s 20 additive credits actually produce'],
]
credits.getRange('C4').formulas = [['=A4*B4']]
credits.getRange('C4:C8').fillDown()
credits.getRange('D4').formulas = [['=C4*0.017234']]
credits.getRange('D4:D8').fillDown()
credits.getRange('E4').formulas = [['=C4*0.26']]
credits.getRange('E4:E8').fillDown()
credits.getRange('A3:F3').format = { fill: '#DDE9E0', font: { bold: true, color: '#17231C' }, wrapText: true, borders: { preset: 'all', style: 'thin', color: '#B8C8BD' } }
credits.getRange('A4:F8').format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: '#D8DED9' } }
credits.getRange('D4:D8').setNumberFormat('$0.00')
credits.getRange('E4:E8').setNumberFormat('0.00')
credits.getRange('A:F').format.columnWidth = 22
credits.getRange('F:F').format.columnWidth = 48
credits.getRange('A10:F12').merge(true)
credits.getRange('A10').values = [['Recommendation: keep the 120-credit included pilot allowance and set additional starting credits to 0. The $20 production spend ceiling remains the hard cash limit. If equal guaranteed access under $20 is required later, create a dedicated 15-credit pilot entitlement instead of using the additive top-up field.']]
credits.getRange('A10:F12').format = { fill: '#FFF4E6', font: { color: '#6B421C', bold: true }, wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#E4B77E' } }

email.getRange('A1:D1').merge()
email.getRange('A1').values = [['Approved concise invitation copy']]
email.getRange('A1:D1').format = { fill: '#17231C', font: { bold: true, color: '#FFFFFF', size: 15 } }
email.getRange('A3:B12').values = [
  ['Field', 'Copy'],
  ['Subject', 'You’re invited to test AI360'],
  ['Greeting', 'Hi {first name},'],
  ['Heading', 'Help us test AI360'],
  ['Purpose', 'You registered for an AI360 introduction session, and we would like you to try the working product.'],
  ['Expectation', 'There is nothing to pay during the pilot. Use AI360 for one real task, then tell us what worked, what was confusing, or what broke.'],
  ['Step 1', 'Open your private link below. There is no password to create.'],
  ['Step 2', 'Try one real task: a proposal, research, social posts, a report, or something else you need to finish.'],
  ['Step 3', 'Reply to this email with your honest feedback. Short and direct is perfect.'],
  ['Button', 'Start testing AI360'],
]
email.getRange('A3:B3').format = { fill: '#DDE9E0', font: { bold: true, color: '#17231C' }, borders: { preset: 'all', style: 'thin', color: '#B8C8BD' } }
email.getRange('A4:B12').format = { wrapText: true, borders: { preset: 'all', style: 'thin', color: '#D8DED9' } }
email.getRange('A:A').format.columnWidth = 20
email.getRange('B:B').format.columnWidth = 82
email.getRange('A14:D15').merge(true)
email.getRange('A14').values = [['Greeting rule: use the first meaningful word from the exported Name field. Remove titles, soften all-caps names, and use “Hi there,” only when no valid name exists. Never derive a greeting from the email address.']]
email.getRange('A14:D15').format = { fill: '#EEF4EF', wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#B8C8BD' } }

const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(path.join(outputDir, 'ai360-pilot-invite-campaign-2026-08-28.xlsx'))

const inspection = await workbook.inspect({ kind: 'sheet,region,formula', maxChars: 7000, tableMaxRows: 8, tableMaxCols: 12 })
console.log(inspection.ndjson)
for (const sheetName of ['Campaign summary', 'Recipients', 'Credit scenarios', 'Email copy']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' })
  await fs.writeFile(path.join(outputDir, `${sheetName.toLowerCase().replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()))
}
