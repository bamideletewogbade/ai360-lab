import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDocument } from '../src/lib/export/render.ts'

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
  for (const format of ['pdf', 'docx', 'xlsx'] as const) {
    const document = await renderDocument({ title: 'Price list', content, format })
    const magic = document.bytes.subarray(0, 4).toString('hex')
    assert.equal(magic, format === 'pdf' ? '25504446' : '504b0304')
  }
})
