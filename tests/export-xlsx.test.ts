import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { buildXlsx, cellRef, numericCell, safeSheetName, uniqueSheetNames } from '../src/lib/export/xlsx.ts'

test('column references keep going past Z', () => {
  assert.equal(cellRef(0, 1), 'A1')
  assert.equal(cellRef(25, 3), 'Z3')
  assert.equal(cellRef(26, 1), 'AA1')
  assert.equal(cellRef(27, 12), 'AB12')
  assert.equal(cellRef(51, 1), 'AZ1')
  assert.equal(cellRef(52, 1), 'BA1')
})

test('only unambiguous numbers become numeric cells', () => {
  assert.equal(numericCell('420'), 420)
  assert.equal(numericCell('-3.5'), -3.5)
  assert.equal(numericCell('0'), 0)
  // Anything carrying meaning beyond the digits stays text.
  assert.equal(numericCell('GHS 420'), null)
  assert.equal(numericCell('1,200'), null)
  assert.equal(numericCell('45%'), null)
  assert.equal(numericCell('007'), null)
  assert.equal(numericCell(''), null)
  assert.equal(numericCell('12 tubs'), null)
})

test('sheet names are stripped of characters Excel rejects', () => {
  assert.equal(safeSheetName('Q1/Q2 results', 'Sheet1'), 'Q1 Q2 results')
  assert.equal(safeSheetName('a[b]c*d?e:f\\g', 'Sheet1'), 'a b c d e f g')
  assert.equal(safeSheetName('', 'Sheet1'), 'Sheet1')
  assert.equal(safeSheetName('x'.repeat(40), 'Sheet1').length, 31)
})

test('duplicate sheet names are made unique without exceeding the length cap', () => {
  assert.deepEqual(uniqueSheetNames(['Prices', 'Prices', 'prices']), ['Prices', 'Prices 2', 'prices 3'])
  const long = uniqueSheetNames(['y'.repeat(31), 'y'.repeat(31)])
  assert.equal(long[1].length <= 31, true)
  assert.notEqual(long[0], long[1])
})

test('an empty workbook is refused rather than written', async () => {
  await assert.rejects(() => buildXlsx([]), /at least one sheet/)
})

test('the workbook is a readable archive with the expected parts', async () => {
  const file = await buildXlsx([{ name: 'Prices', rows: [['Item', 'Cost'], ['Shea 5kg', '420']] }])
  const zip = await JSZip.loadAsync(file)
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    assert.ok(zip.file(part), `missing ${part}`)
  }
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  // Header text is an inline string; the price is a real number.
  assert.match(sheet, /<t xml:space="preserve">Item<\/t>/)
  assert.match(sheet, /<c r="B2"><v>420<\/v><\/c>/)
})

test('cell content that would break the XML is escaped, not emitted raw', async () => {
  const file = await buildXlsx([{ name: 'S', rows: [['a & b <tag>', 'say "hi"']] }])
  const zip = await JSZip.loadAsync(file)
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  assert.match(sheet, /a &amp; b &lt;tag&gt;/)
  assert.ok(!sheet.includes('<tag>'), 'raw markup leaked into the sheet')
})

test('multiple tables become multiple named sheets', async () => {
  const file = await buildXlsx([
    { name: 'First', rows: [['a']] },
    { name: 'Second', rows: [['b']] },
  ])
  const zip = await JSZip.loadAsync(file)
  const workbook = await zip.file('xl/workbook.xml')!.async('string')
  assert.match(workbook, /name="First"/)
  assert.match(workbook, /name="Second"/)
  assert.ok(zip.file('xl/worksheets/sheet2.xml'))
})

test('ragged rows do not misalign columns', async () => {
  const file = await buildXlsx([{ name: 'S', rows: [['a', 'b', 'c'], ['only one'], ['x', '', 'z']] }])
  const zip = await JSZip.loadAsync(file)
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  // The third row's last value must still land in column C, not slide into B.
  assert.match(sheet, /<c r="C3" t="inlineStr"><is><t xml:space="preserve">z<\/t><\/is><\/c>/)
})
