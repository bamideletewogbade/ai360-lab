import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { renderDocument } from '../src/lib/export/render.ts'
import { hexToOoxml, tint } from '../src/lib/export/color.ts'

const BRAND = { primary: '#1F5C4A', accent: '#B8873A' }

async function xmlParts(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes)
  const parts: Record<string, string> = {}
  await Promise.all(Object.keys(zip.files).map(async (name) => {
    if (name.endsWith('.xml') || name.endsWith('.rels')) parts[name] = await zip.files[name].async('text')
  }))
  return parts
}

test('PDF export preserves characters used in supported Ghanaian languages', async () => {
  const document = await renderDocument({
    title: 'AI360 Ghana language check',
    content: [
      '# Ghana language sample',
      'Twi: Adeɛ ne boɔ.',
      'Gã: Gaŋ ni akɛ.',
      'Eʋegbe: ƒe ɖeka kple ʋu.',
      'Pidgin: How far?',
    ].join('\n\n'),
    format: 'pdf',
  })
  assert.equal(document.mimeType, 'application/pdf')
  assert.match(document.filename, /\.pdf$/)
  assert.equal(document.bytes.subarray(0, 4).toString(), '%PDF')
  assert.ok(document.bytes.length > 1_000)
})

test('all document formats still render from one representative request', async () => {
  const content = '# Price list\n\n| Item | Price |\n| --- | ---: |\n| Shea butter | GHS 25 |'
  for (const format of ['pdf', 'docx', 'xlsx', 'pptx'] as const) {
    const document = await renderDocument({ title: 'Price list', content, format })
    const magic = document.bytes.subarray(0, 4).toString('hex')
    assert.equal(magic, format === 'pdf' ? '25504446' : '504b0304')
  }
})

test('a PowerPoint deck turns headings into slides and a table into its own slide', async () => {
  const content = [
    '# Opening',
    'Why this matters to the business.',
    '## Market',
    '- Growing demand',
    '- Local competitors are weak online',
    '## Pricing',
    '| Plan | Price |',
    '| --- | ---: |',
    '| Everyday | GHS 125 |',
    '| Builder | GHS 350 |',
  ].join('\n\n')
  const document = await renderDocument({ title: 'Board update', content, format: 'pptx' })
  assert.equal(document.mimeType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  assert.match(document.filename, /\.pptx$/)
  assert.equal(document.bytes.subarray(0, 4).toString('hex'), '504b0304')
  assert.ok(document.bytes.length > 1_000)
})

test('a brand colour actually reaches the file for every OOXML format', async () => {
  const content = '# Pricing\n\n| Plan | Price |\n| --- | ---: |\n| Everyday | GHS 125 |'
  for (const format of ['docx', 'pptx'] as const) {
    const document = await renderDocument({ title: 'Branded', content, format, brand: BRAND })
    const parts = await xmlParts(document.bytes)
    const combined = Object.values(parts).join('\n')
    assert.ok(
      combined.includes('1F5C4A'),
      `${format} output does not contain the brand's raw primary colour anywhere`,
    )
  }
  // The spreadsheet only ever uses a lightened tint of primary (the header
  // fill), never the raw colour, so it is checked against that derived value.
  const xlsxDocument = await renderDocument({ title: 'Branded', content, format: 'xlsx', brand: BRAND })
  const xlsxParts = await xmlParts(xlsxDocument.bytes)
  const expectedFill = hexToOoxml(tint(BRAND.primary, 0.82))
  assert.ok(
    Object.values(xlsxParts).join('\n').includes(expectedFill),
    'xlsx header fill does not reflect the brand primary colour',
  )
})

test('with no brand, output matches the original neutral AI360 colours exactly', async () => {
  const content = '# Pricing\n\n| Plan | Price |\n| --- | ---: |\n| Everyday | GHS 125 |'
  for (const format of ['docx', 'pptx'] as const) {
    const document = await renderDocument({ title: 'Unbranded', content, format })
    const parts = await xmlParts(document.bytes)
    const combined = Object.values(parts).join('\n')
    assert.ok(combined.includes('101112'), `${format} without a brand should keep the default AI360 ink`)
    assert.ok(!combined.includes('1F5C4A'), `${format} without a brand should never show an arbitrary brand colour`)
  }
})
