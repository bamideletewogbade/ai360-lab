/**
 * Small, pure colour helpers shared by every document builder.
 *
 * A brand kit gives a document two colours: primary and accent. Everything
 * else — the exact table-header tint, whether the text sitting on a colour
 * band should be black or white, the RGB triplet a given renderer's API
 * wants — is derived here once, so the four builders (which each embed
 * colour in a completely different way: hex strings in XML, floats in
 * pdf-lib) never duplicate this arithmetic or disagree with each other.
 */

/**
 * What a document builder needs to look like a customer's business rather
 * than AI360's own product: a primary and an accent colour. Nothing else —
 * body text stays a fixed, readable neutral in every builder, so a bad or
 * unlucky colour pair can never make a document hard to read.
 */
export type DocumentBrand = { primary: string; accent: string }

const HEX_RE = /^#([0-9a-fA-F]{6})$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}

/** Normalizes to uppercase, unprefixed 6-digit hex, or null if not a valid colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(HEX_RE)
  return match ? `#${match[1].toUpperCase()}` : null
}

function toBytes(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) || '#101112'
  const n = normalized.slice(1)
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

/** 0–1 floats, the shape `pdf-lib`'s `rgb()` takes. */
export function hexToRgb01(hex: string): [number, number, number] {
  const [r, g, b] = toBytes(hex)
  return [r / 255, g / 255, b / 255]
}

/** Bare 6-digit hex, no `#` — the shape OOXML (`docx`/`pptx`/`xlsx` XML) wants. */
export function hexToOoxml(hex: string): string {
  return (normalizeHex(hex) || '#101112').slice(1)
}

/** Lightens a colour toward white. `amount` 0 returns the colour unchanged, 1 returns white. */
export function tint(hex: string, amount: number) {
  const clamped = Math.max(0, Math.min(1, amount))
  const [r, g, b] = toBytes(hex)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * clamped)
  const toHexPair = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${toHexPair(mix(r))}${toHexPair(mix(g))}${toHexPair(mix(b))}`.toUpperCase()
}

/**
 * Relative luminance (WCAG formula), used only to pick a readable text colour
 * — not exposed as a general contrast checker, so it stays a private detail
 * rather than a second API surface to keep in sync with `readableTextHex`.
 */
function relativeLuminance(hex: string) {
  const [r, g, b] = toBytes(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Black or white, whichever reads clearly on the given background. */
export function readableTextHex(backgroundHex: string) {
  return relativeLuminance(backgroundHex) > 0.5 ? '#101112' : '#FFFFFF'
}
