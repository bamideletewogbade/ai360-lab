/**
 * Pixel dimensions of a PNG or JPEG, read from the file header.
 *
 * A logo can be embedded at the right aspect ratio without a full image
 * library — PNG publishes its size in the first 24 bytes (the IHDR chunk),
 * and JPEG publishes it in the first frame-start-of-frame marker, both
 * simple, well-documented byte layouts. Pulling in an image library for this
 * one fact would be a large dependency for a single pair of integers.
 */

export type ImageDimensions = { width: number; height: number }

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  // Signature (8 bytes) + length (4) + "IHDR" (4) + width (4) + height (4).
  if (bytes.length < 24) return null
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (!isPng) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  return width > 0 && height > 0 ? { width, height } : null
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    // The SOF (start of frame) markers carry the dimensions. 0xC0-0xCF except
    // the DHT/JPG/DAC markers (C4, C8, CC), per the JPEG spec.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    const segmentLength = view.getUint16(offset + 2, false)
    if (isSof) {
      const height = view.getUint16(offset + 5, false)
      const width = view.getUint16(offset + 7, false)
      return width > 0 && height > 0 ? { width, height } : null
    }
    offset += 2 + segmentLength
  }
  return null
}

export function readImageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  if (mimeType === 'image/png') return readPngDimensions(bytes)
  if (mimeType === 'image/jpeg') return readJpegDimensions(bytes)
  return null
}

/** Scales to fit within a box without distorting the image. */
export function fitWithin(size: ImageDimensions, maxWidth: number, maxHeight: number): ImageDimensions {
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1)
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}
