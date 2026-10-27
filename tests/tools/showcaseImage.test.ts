import { describe, expect, it } from 'vitest'
import {
  SHOWCASE_BITMAP,
  decodeMonoPng,
  encodeMonoPng,
  pngDataUri,
  withShowcaseImageUrl,
} from '../../tools/showcaseImage'

describe('encodeMonoPng', () => {
  it('round-trips the showcase bitmap through a 1-bit greyscale PNG', () => {
    const png = encodeMonoPng(SHOWCASE_BITMAP)
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(decodeMonoPng(png)).toEqual({ width: 32, height: 32, rows: [...SHOWCASE_BITMAP] })
  })

  it('rejects a ragged or mis-drawn bitmap instead of packing garbage', () => {
    expect(() => encodeMonoPng(['##', '#'])).toThrow(/Row 1 is 1 wide/)
    expect(() => encodeMonoPng(['#x'])).toThrow(/not '#' or '.'/)
  })

  it('produces a base64 data: URI with no whitespace', () => {
    const uri = pngDataUri(encodeMonoPng(['#.', '.#']))
    expect(uri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
  })
})

describe('withShowcaseImageUrl', () => {
  const uri = 'data:image/png;base64,AAAA'

  it('replaces a plain url line', () => {
    const yaml = '- type: dlimg\n  url: /local/showcase.png\n  x: 330\n'
    expect(withShowcaseImageUrl(yaml, uri)).toBe(`- type: dlimg\n  url: ${uri}\n  x: 330\n`)
  })

  it('replaces an existing data: url line (re-running is the upgrade path)', () => {
    const yaml = `- type: dlimg\n  url: data:image/png;base64,OLD+OLD/==\n`
    expect(withShowcaseImageUrl(yaml, uri)).toBe(`- type: dlimg\n  url: ${uri}\n`)
  })

  it('refuses when there is not exactly one showcase image line', () => {
    expect(() => withShowcaseImageUrl('- type: text\n', uri)).toThrow(/found 0/)
    expect(() =>
      withShowcaseImageUrl('  url: /local/showcase.png\n  url: /local/showcase.png\n', uri),
    ).toThrow(/found 2/)
  })
})
