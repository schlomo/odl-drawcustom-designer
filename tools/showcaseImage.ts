import { readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

/**
 * Generates the Load Demo's `dlimg` image (ADR-015) and embeds it into
 * `showcase.yml` as a `data:image/png;base64,…` URI, so the demo payload is
 * self-contained: it previews here and sends to a real display through
 * odl-renderer without any file on the Home Assistant host (`/local/…` used
 * to be a designer-only key that Pillow treated as a filesystem path).
 *
 * The PNG is written by hand — 1-bit greyscale, no palette, filter 0 — from
 * the ASCII bitmap below, so the bytes are reproducible with nothing but
 * node's own zlib:
 *
 *     node tools/showcaseImage.ts        (or: npm run showcase:image)
 *
 * Both outputs are derived files: the script rewrites them, the diff is the
 * review. `tests/ui/data/showcase-bundle.test.ts` pins the committed PNG to
 * this bitmap and the YAML's `url:` to the committed PNG.
 */

export const SHOWCASE_PNG_PATH = 'src/assets/showcase/showcase.png'
export const SHOWCASE_YAML_PATH = 'src/assets/showcase/showcase.yml'

/** `#` = black, `.` = white. 32×32, a bold "ODL" wordmark. */
export const SHOWCASE_BITMAP: readonly string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..#######..#######...###........',
  '.#########.########..###........',
  '.#########.#########.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.###...###.###...###.###........',
  '.#########.#########.########...',
  '.#########.########..########...',
  '..#######..#######...########...',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
]

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, 'latin1')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(data, crc32(typeBytes)))
  return Buffer.concat([length, typeBytes, data, crc])
}

/** Pack `.`/`#` rows into 1-bit greyscale scanlines (1 = white, 0 = black), each prefixed with filter byte 0. */
function packScanlines(rows: readonly string[]): Uint8Array {
  const width = rows[0]!.length
  const stride = Math.ceil(width / 8)
  const out = new Uint8Array(rows.length * (stride + 1))
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Row ${y} is ${row.length} wide, expected ${width}`)
    }
    const base = y * (stride + 1) + 1
    for (let x = 0; x < width; x += 1) {
      const pixel = row[x]
      if (pixel !== '#' && pixel !== '.') {
        throw new Error(`Row ${y}, column ${x}: ${JSON.stringify(pixel)} is not '#' or '.'`)
      }
      if (pixel === '.') {
        out[base + (x >> 3)]! |= 0x80 >> (x & 7)
      }
    }
  })
  return out
}

/** Encode a `.`/`#` bitmap as a 1-bit greyscale PNG. */
export function encodeMonoPng(rows: readonly string[]): Uint8Array {
  const width = rows[0]!.length
  const height = rows.length
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 1 // bit depth
  ihdr[9] = 0 // colour type: greyscale
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const idat = deflateSync(packScanlines(rows), { level: 9 })
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())])
}

export interface MonoPng {
  width: number
  height: number
  rows: string[]
}

/** Decode a PNG produced by {@link encodeMonoPng} back into its bitmap (test seam — rejects anything else). */
export function decodeMonoPng(bytes: Uint8Array): MonoPng {
  const buffer = Buffer.from(bytes)
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG')
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const bitDepth = buffer[24]
  const colourType = buffer[25]
  if (bitDepth !== 1 || colourType !== 0) {
    throw new Error(`Expected 1-bit greyscale, got bit depth ${bitDepth}, colour type ${colourType}`)
  }
  const idat: Buffer[] = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    if (type === 'IDAT') {
      idat.push(buffer.subarray(offset + 8, offset + 8 + length))
    }
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = Math.ceil(width / 8)
  const rows: string[] = []
  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1)
    if (raw[base] !== 0) {
      throw new Error(`Row ${y} uses filter ${raw[base]}, expected 0`)
    }
    let row = ''
    for (let x = 0; x < width; x += 1) {
      row += raw[base + 1 + (x >> 3)]! & (0x80 >> (x & 7)) ? '.' : '#'
    }
    rows.push(row)
  }
  return { width, height, rows }
}

export function pngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
}

const DLIMG_URL_LINE = /^(\s*url: )(?:\/local\/showcase\.png|data:image\/png;base64,[A-Za-z0-9+/=]+)$/m

/** Replace the showcase `dlimg` element's `url:` with `dataUri` — exactly one such line must exist. */
export function withShowcaseImageUrl(yaml: string, dataUri: string): string {
  const matches = yaml.match(new RegExp(DLIMG_URL_LINE.source, 'gm')) ?? []
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one showcase dlimg url line, found ${matches.length}`)
  }
  return yaml.replace(DLIMG_URL_LINE, `$1${dataUri}`)
}

export function generateShowcaseImage(): void {
  const png = encodeMonoPng(SHOWCASE_BITMAP)
  writeFileSync(SHOWCASE_PNG_PATH, png)
  const yaml = readFileSync(SHOWCASE_YAML_PATH, 'utf8')
  writeFileSync(SHOWCASE_YAML_PATH, withShowcaseImageUrl(yaml, pngDataUri(png)))
  console.log(`Wrote ${SHOWCASE_PNG_PATH} (${png.length} bytes) and its data: URI into ${SHOWCASE_YAML_PATH}`)
}

if (import.meta.main) {
  generateShowcaseImage()
}
