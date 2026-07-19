import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFont, registerFont, unregisterFont, type DrawElement, type RenderContext } from '../../../src/core'
import { renderText } from '../../../src/core/renderer/text'
import { measureInkBoundingBox } from '../../../src/core/renderer/text-ink-bounds'
import { measureTextWidth } from '../../../src/core/renderer/text-layout'
import { computeOpentypeGlyphPositions } from '../../../src/core/renderer/opentype-glyphs'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/fonts/InterVariable.ttf',
)
const FONT_KEY = 'InterVariable.ttf'

/**
 * Issue #10: uploading a real variable TTF (Inter) and selecting it as a text
 * element's font made the element vanish completely — no outline, no error.
 *
 * Root cause (see investigation): `text-ink-bounds.ts`'s `measureInkBoundingBox`
 * called `font.getPath()`, which routes every glyph through
 * `font.variation.getTransform()` whenever the font has `fvar`+`gvar` tables —
 * engaging opentype.js's variable-font instancing machinery unconditionally.
 * Separately (and this is the actual crash for the real Inter file, verified
 * empirically before writing this fix): Inter's GSUB table uses a chained
 * contextual substitution lookup (type 6, format 2) that opentype.js 2.0.0
 * cannot parse. That throws for ANY 2+ character string through
 * `font.stringToGlyphs` / `forEachGlyph` / `getPath` — in BOTH the static and
 * variable Inter builds, so it is not specific to variable fonts, but it is
 * what actually crashes on this exact fixture.
 *
 * Target behavior (ADR-007 Pillow parity): HA imagegen's Pillow rendering
 * never applies OpenType Layout (GSUB/GPOS) shaping and never touches
 * variable-font axes — `ImageFont.truetype()` used plainly renders a
 * variable font at its default instance. This fix makes the designer do the
 * same: shape via the font's own `forEachGlyph` (preserving ligatures/bidi
 * features for fonts that support them) but never pass `font` to
 * `glyph.getPath()` (so variation is never engaged — default instance), and
 * fall back to a naive cmap-only glyph walk when the font's own shaping
 * throws (fonts like Inter).
 */
describe('variable font (Inter) Pillow parity — issue #10', () => {
  afterEach(() => {
    unregisterFont(FONT_KEY)
  })

  function loadInterVariable() {
    const buffer = readFileSync(fixturePath)
    const font = parseFont(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    )
    registerFont(FONT_KEY, font)
    return font
  }

  it('sanity check: the fixture is a real variable font (fvar + gvar present)', () => {
    const font = loadInterVariable()
    expect(font.tables.fvar).toBeTruthy()
    expect(font.tables.gvar).toBeTruthy()
  })

  it('measureTextWidth computes a real width for multi-character text instead of throwing', () => {
    const font = loadInterVariable()
    const width = measureTextWidth(font, 'Hello World', 20)
    expect(Number.isFinite(width)).toBe(true)
    expect(width).toBeGreaterThan(0)
  })

  it('measureInkBoundingBox computes real, non-degenerate ink bounds instead of throwing', () => {
    const font = loadInterVariable()
    const bbox = measureInkBoundingBox(font, 'Hello World', 20)
    expect(Number.isFinite(bbox.x1)).toBe(true)
    expect(Number.isFinite(bbox.y1)).toBe(true)
    expect(bbox.width).toBeGreaterThan(0)
    expect(bbox.height).toBeGreaterThan(0)
  })

  it('computeOpentypeGlyphPositions returns one position per character, laid out left-to-right', () => {
    const font = loadInterVariable()
    const positions = computeOpentypeGlyphPositions(font, 'Hello', 20, 0, 0)
    expect(positions).toHaveLength(5)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!.x).toBeGreaterThan(positions[i - 1]!.x)
    }
  })

  it('renders glyph outlines at the DEFAULT instance — matches glyph.getPath() called without variation', () => {
    const font = loadInterVariable()
    const [position] = computeOpentypeGlyphPositions(font, 'H', 20, 0, 0)
    const pathNoVariation = position!.glyph.getPath(position!.x, position!.y, 20)
    // Engaging variation explicitly, at whatever axis coordinates the font
    // considers "default" — for a well-formed variable font these must be
    // the same outline as the plain glyf table (no font arg).
    const pathWithVariationAtDefault = position!.glyph.getPath(position!.x, position!.y, 20, {}, font)
    expect(pathNoVariation.commands).toEqual(pathWithVariationAtDefault.commands)
  })

  it('renderText produces a real, bounded primitive instead of throwing / vanishing', () => {
    loadInterVariable()
    const element: DrawElement = {
      type: 'text',
      value: 'Hello World',
      x: 5,
      y: 5,
      font: FONT_KEY,
    }
    const ctx: RenderContext = { width: 296, height: 128, colorMode: 'bw' }

    const result = renderText(element, ctx)

    expect(result).not.toBeNull()
    if (result?.layer !== 'canvas' || result.primitive.kind !== 'text-stub') {
      throw new Error(`expected a text-stub primitive, got ${JSON.stringify(result)}`)
    }
    expect(result.primitive.width).toBeGreaterThan(0)
    expect(result.primitive.height).toBeGreaterThan(0)
  })
})
