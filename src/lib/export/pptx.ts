import JSZip from 'jszip'
import type { ExportBlock } from '@/lib/export/render'
import { hexToOoxml, readableTextHex, tint, type DocumentBrand } from '@/lib/export/color'

/**
 * A minimal, dependency-light PPTX writer.
 *
 * Same reasoning as `xlsx.ts`: a .pptx is a zip of XML parts, so the only thing
 * actually needed is a zip container already in the tree. Every shape is drawn
 * with an explicit absolute position rather than inherited from a slide layout,
 * which keeps the required skeleton (one master, one layout, one theme) small
 * and avoids pulling in a full presentation-authoring library for what is, in
 * this product, always the same shape: a title slide, then a run of heading
 * slides carrying bullets, short paragraphs or a table.
 */

const SLIDE_W = 12192000 // 13.333in, standard 16:9 widescreen
const SLIDE_H = 6858000 // 7.5in
const MARGIN = 685800 // 0.75in
const CONTENT_W = SLIDE_W - MARGIN * 2

const INK = '101112'
const CHARCOAL = '292B2D'
const GREY = '56595C'
const LINE = 'E3E1DA'
const SHADE = 'F1F0EC'
const PAPER = 'FBFAF7'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

type SlideItem =
  | { kind: 'text'; text: string; italic?: boolean; mono?: boolean }
  | { kind: 'bullet'; text: string; numbered?: boolean }

type ContentSlide =
  | { heading: string; items: SlideItem[]; table?: undefined }
  | { heading: string; items?: undefined; table: string[][] }

/** How much visual room an item is worth, so a slide fills without overflowing. */
function unitWeight(item: SlideItem) {
  if (item.kind !== 'text') return 1
  if (item.text.length > 220) return 3
  if (item.text.length > 90) return 2
  return 1
}

function itemsForBlock(block: ExportBlock): SlideItem[] {
  if (block.type === 'paragraph') return [{ kind: 'text', text: block.text }]
  if (block.type === 'quote') return [{ kind: 'text', text: block.text, italic: true }]
  if (block.type === 'code') return [{ kind: 'text', text: block.text, mono: true }]
  if (block.type === 'bullet') return block.items.map((text) => ({ kind: 'bullet', text }))
  if (block.type === 'number') return block.items.map((text) => ({ kind: 'bullet', text, numbered: true }))
  return []
}

const MAX_UNITS_PER_SLIDE = 7
const MAX_CONTENT_SLIDES = 30
const TABLE_ROWS_PER_SLIDE = 12

/** Splits a wide table into row chunks that keep the header on every slide. */
function tableSlides(heading: string, rows: string[][]): ContentSlide[] {
  const header = rows[0] ?? []
  const dataRows = rows.slice(1)
  if (!dataRows.length) return [{ heading, table: rows }]
  const chunks: string[][][] = []
  for (let index = 0; index < dataRows.length; index += TABLE_ROWS_PER_SLIDE) {
    chunks.push(dataRows.slice(index, index + TABLE_ROWS_PER_SLIDE))
  }
  return chunks.map((chunk, index) => ({
    heading: chunks.length > 1 ? `${heading} (${index + 1}/${chunks.length})` : heading,
    table: [header, ...chunk],
  }))
}

/**
 * Turn parsed markdown into a deck.
 *
 * A heading starts a new slide. A table always gets its own slide — mixing a
 * grid with bullet points reads as clutter, not a deck. Everything else
 * accumulates under the current heading until the visual budget is spent, at
 * which point a "(cont.)" slide picks up where it left off.
 */
export function slidesFromBlocks(title: string, blocks: ExportBlock[]): ContentSlide[] {
  const slides: ContentSlide[] = []
  let heading = title
  let current: SlideItem[] = []
  let units = 0

  const flush = () => {
    if (current.length) slides.push({ heading, items: current })
    current = []
    units = 0
  }

  for (const block of blocks) {
    if (slides.length >= MAX_CONTENT_SLIDES) break
    if (block.type === 'heading' && block.level <= 2) {
      flush()
      heading = block.text
      continue
    }
    if (block.type === 'table' && block.rows.length) {
      flush()
      slides.push(...tableSlides(heading, block.rows))
      continue
    }
    for (const item of itemsForBlock(block)) {
      const weight = unitWeight(item)
      if (units + weight > MAX_UNITS_PER_SLIDE && current.length) {
        flush()
        heading = `${heading} (cont.)`
      }
      current.push(item)
      units += weight
    }
  }
  flush()

  if (slides.length >= MAX_CONTENT_SLIDES) {
    slides.length = MAX_CONTENT_SLIDES
    slides.push({ heading: 'More in the full document', items: [
      { kind: 'text', text: 'This deck is capped at 30 slides. The complete content is in the source document.' },
    ] })
  }
  if (!slides.length) {
    slides.push({ heading: title, items: [{ kind: 'text', text: 'No structured content was generated.' }] })
  }
  return slides
}

function xfrm(x: number, y: number, cx: number, cy: number) {
  return `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
}

function paragraphRun(text: string, options: { size: number; color: string; bold?: boolean; italic?: boolean; mono?: boolean; bullet?: 'char' | 'num' | 'none' }) {
  const font = options.mono ? 'Consolas' : 'Arial'
  const bulletXml = options.bullet === 'char'
    ? `<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>`
    : options.bullet === 'num'
      ? `<a:buFont typeface="Arial"/><a:buAutoNum type="arabicPeriod"/>`
      : `<a:buNone/>`
  const pPr = options.bullet && options.bullet !== 'none'
    ? `<a:pPr marL="285750" indent="-285750">${bulletXml}</a:pPr>`
    : `<a:pPr>${bulletXml}</a:pPr>`
  return `<a:p>${pPr}<a:r><a:rPr lang="en-US" sz="${options.size}" b="${options.bold ? 1 : 0}" i="${options.italic ? 1 : 0}"><a:solidFill><a:srgbClr val="${options.color}"/></a:solidFill><a:latin typeface="${font}"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r></a:p>`
}

function textBoxShape(id: number, x: number, y: number, cx: number, cy: number, paragraphs: string, options: { anchor?: 't' | 'ctr' | 'b' } = {}) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${options.anchor || 't'}" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
}

function rectShape(id: number, x: number, y: number, cx: number, cy: number, fillHex: string) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rect ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
}

function footerRun(id: number, pageNumber: number, pageCount: number) {
  const paragraph = `<a:p><a:pPr algn="r"/><a:r><a:rPr lang="en-US" sz="900"><a:solidFill><a:srgbClr val="${GREY}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${escapeXml(`Created with AI360   |   ${pageNumber} of ${pageCount}`)}</a:t></a:r></a:p>`
  return textBoxShape(id, SLIDE_W - MARGIN - 3200000, SLIDE_H - 420000, 3200000, 300000, paragraph)
}

function tableGraphicFrame(id: number, x: number, y: number, rows: string[][], brand?: DocumentBrand) {
  const columns = Math.max(1, rows[0]?.length || 1)
  const colWidth = Math.floor(CONTENT_W / columns)
  const rowHeight = 380000
  const headerFill = brand ? hexToOoxml(tint(brand.primary, 0.85)) : SHADE
  const headerText = brand ? hexToOoxml(readableTextHex(`#${headerFill}`)) : INK
  const grid = Array.from({ length: columns }, () => `<a:gridCol w="${colWidth}"/>`).join('')
  const body = rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: columns }, (_, columnIndex) => {
        const value = row[columnIndex] || ''
        const header = rowIndex === 0
        const paragraph = `<a:p><a:r><a:rPr lang="en-US" sz="${header ? 1200 : 1100}" b="${header ? 1 : 0}"><a:solidFill><a:srgbClr val="${header ? headerText : CHARCOAL}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${escapeXml(value)}</a:t></a:r></a:p>`
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph}</a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr"><a:solidFill><a:srgbClr val="${header ? headerFill : 'FFFFFF'}"/></a:solidFill><a:lnL w="6350"><a:solidFill><a:srgbClr val="${LINE}"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="${LINE}"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="${LINE}"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="${LINE}"/></a:solidFill></a:lnB></a:tcPr></a:tc>`
      }).join('')
      return `<a:tr h="${rowHeight}">${cells}</a:tr>`
    })
    .join('')
  const height = rows.length * rowHeight
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${CONTENT_W}" cy="${height}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="0"/><a:tblGrid>${grid}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

function titleSlideXml(title: string, preparedLine: string, brand?: DocumentBrand) {
  const bg = brand ? hexToOoxml(brand.primary) : INK
  const titleText = brand ? hexToOoxml(readableTextHex(`#${bg}`)) : 'FFFFFF'
  // A muted label/date reads on either a light or a dark cover, unlike the
  // fixed light-grey pair that only worked against the neutral AI360 black.
  const mutedText = titleText === 'FFFFFF' ? 'C9CBCD' : GREY
  const mutedText2 = titleText === 'FFFFFF' ? '9B9D9F' : GREY
  const shapes = [
    rectShape(2, 0, 0, SLIDE_W, SLIDE_H, bg),
    textBoxShape(3, MARGIN, 620000, CONTENT_W, 340000, paragraphRun('AI360', { size: 1400, color: mutedText, bold: true, bullet: 'none' })),
    textBoxShape(4, MARGIN, 2500000, CONTENT_W, 2100000, paragraphRun(title, { size: 4000, color: titleText, bold: true, bullet: 'none' }), { anchor: 'ctr' }),
    textBoxShape(5, MARGIN, 4750000, CONTENT_W, 400000, paragraphRun(preparedLine, { size: 1400, color: mutedText2, bullet: 'none' })),
  ].join('')
  return slideShell(shapes)
}

function contentSlideXml(slide: ContentSlide, pageNumber: number, pageCount: number, brand?: DocumentBrand) {
  const headingColor = brand ? hexToOoxml(brand.primary) : INK
  const shapes: string[] = [
    textBoxShape(2, MARGIN, 320000, CONTENT_W, 300000, paragraphRun('AI THREE SIXTY', { size: 1100, color: GREY, bold: true, bullet: 'none' })),
    textBoxShape(3, MARGIN, 680000, CONTENT_W, 700000, paragraphRun(slide.heading, { size: 2600, color: headingColor, bold: true, bullet: 'none' })),
  ]
  // A short accent underline beneath the title is the one flourish a branded
  // deck earns beyond recolouring what was already there.
  if (brand) shapes.push(rectShape(7, MARGIN, 1420000, 620000, 24000, hexToOoxml(brand.accent)))
  const bodyTop = 1550000
  const bodyHeight = SLIDE_H - bodyTop - 500000

  if (slide.table) {
    shapes.push(tableGraphicFrame(4, MARGIN, bodyTop, slide.table, brand))
  } else {
    const paragraphs = (slide.items ?? [])
      .map((item) => item.kind === 'bullet'
        ? paragraphRun(item.text, { size: 1800, color: CHARCOAL, bullet: item.numbered ? 'num' : 'char' })
        : paragraphRun(item.text, { size: 1800, color: CHARCOAL, italic: item.italic, mono: item.mono, bullet: 'none' }))
      .join('')
    shapes.push(textBoxShape(4, MARGIN, bodyTop, CONTENT_W, bodyHeight, paragraphs))
  }
  shapes.push(footerRun(5, pageNumber, pageCount))
  return slideShell(shapes.join(''))
}

function slideShell(shapes: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${PAPER}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AI360"><a:themeElements><a:clrScheme name="AI360"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${INK}"/></a:dk2><a:lt2><a:srgbClr val="${PAPER}"/></a:lt2><a:accent1><a:srgbClr val="${INK}"/></a:accent1><a:accent2><a:srgbClr val="${GREY}"/></a:accent2><a:accent3><a:srgbClr val="A6633E"/></a:accent3><a:accent4><a:srgbClr val="${LINE}"/></a:accent4><a:accent5><a:srgbClr val="${CHARCOAL}"/></a:accent5><a:accent6><a:srgbClr val="${SHADE}"/></a:accent6><a:hlink><a:srgbClr val="${INK}"/></a:hlink><a:folHlink><a:srgbClr val="${GREY}"/></a:folHlink></a:clrScheme><a:fontScheme name="AI360"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="AI360"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

const BLANK_SPTREE = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`

const SLIDE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${BLANK_SPTREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`

const SLIDE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank">${BLANK_SPTREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`

export async function buildPptx(title: string, blocks: ExportBlock[], brand?: DocumentBrand): Promise<Buffer> {
  const contentSlides = slidesFromBlocks(title, blocks)
  const slideCount = contentSlides.length + 1 // plus the title slide
  const preparedLine = `Prepared ${new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date())}`
  const now = new Date().toISOString()

  const zip = new JSZip()

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${Array.from(
      { length: slideCount },
      (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    ).join('')}</Types>`,
  )

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  )

  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>AI360</dc:creator><cp:lastModifiedBy>AI360</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
  )

  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>AI360</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides><Company>AI360</Company></Properties>`,
  )

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from(
      { length: slideCount },
      (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
    ).join('')}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  )

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${Array.from(
      { length: slideCount },
      (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
    ).join('')}</Relationships>`,
  )

  zip.file('ppt/theme/theme1.xml', THEME_XML)
  zip.file('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER_XML)
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  )
  zip.file('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT_XML)
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  )

  const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`

  zip.file('ppt/slides/slide1.xml', titleSlideXml(title, preparedLine, brand))
  zip.file('ppt/slides/_rels/slide1.xml.rels', slideRels)
  contentSlides.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 2}.xml`, contentSlideXml(slide, index + 2, slideCount, brand))
    zip.file(`ppt/slides/_rels/slide${index + 2}.xml.rels`, slideRels)
  })

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
