import { beforeAll, describe, expect, it } from 'vitest'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import { renderText } from '../../../src/core/renderer/text'
import { getFontMetrics } from '../../../src/core/renderer/text-layout'
import { measureInkBoundingBox } from '../../../src/core/renderer/text-ink-bounds'
import type { RenderContext } from '../../../src/core/renderer/types'
import { loadBundledTestFont } from './font-test-utils'

/**
 * Maintainer finding (2026-09-01, designer canvas vs host render side by
 * side): with line spacing already matched, the whole multiline block still
 * sat LOWER in our canvas than on the device, measured against a `text`
 * element at the same `y` — which lines up in both renderers.
 *
 * Cause: the two upstream handlers default `anchor` differently.
 *
 *   # odl_renderer/elements/text.py — draw_multiline (line 168)
 *   anchor = element.get("anchor", "lm")
 *   ...
 *   draw.text((x, current_y), str(line), font=font, anchor=anchor, ...)
 *
 *   # odl_renderer/elements/text.py — draw_text (lines 49, 68-69)
 *   anchor = element.get("anchor")
 *   if not anchor:
 *       anchor = "la" if "\n" in final_text else "lt"
 *
 * So a plain `text` is anchored `lt` and a `multiline` is anchored `lm`, per
 * line, at that line's own `current_y`.
 *
 * Pillow's vertical anchor semantics, measured against Pillow 12.3.0 with
 * ppb.ttf @ 20 (ascent 21, descent 7) by rendering each anchor and recovering
 * the baseline — `a`/`m`/`s`/`d` are FONT-METRIC (constant across strings),
 * `t`/`b` are INK (they track the glyphs actually drawn):
 *
 *   anchor  baseline relative to the passed y
 *   a       + ascent                     (+21, constant)
 *   t       - ink.y1                     (+16 'Line 1', +11 'xxx', +4 '.')
 *   m       + (ascent - descent) / 2     (+7, constant)
 *   s       + 0
 *   b       - ink.y2                     (0 'Line 1', -5 'gy')
 *   d       - descent                    (-7, constant)
 *
 * `m` being metric rather than ink-middle is the crux: our renderer placed
 * the ink TOP at `y` for multiline, so the block hung a metric half-box lower
 * than upstream's.
 */

const context: RenderContext = { width: 400, height: 300, colorMode: 'bwr' }

const FONT = 'ppb.ttf'
const SIZE = 20

/** The maintainer's payload, verbatim. */
function maintainerMultiline(overrides: Record<string, unknown> = {}) {
  return {
    type: 'multiline' as const,
    value: 'Line 1|Line 2|Line 3',
    delimiter: '|',
    x: 80,
    offset_y: 26,
    y: 10,
    font: FONT,
    size: SIZE,
    ...overrides,
  }
}

function maintainerText() {
  return { type: 'text' as const, value: 'Hello World!', x: 150, y: 10, font: FONT, size: SIZE }
}

function multilinePrimitive(element: ReturnType<typeof maintainerMultiline>) {
  const result = renderMultiline(element, context)
  if (result?.primitive.kind !== 'multiline-stub') {
    throw new Error('expected a multiline-stub primitive')
  }
  return result.primitive
}

function textBaseline(): number {
  const result = renderText(maintainerText(), context)
  if (result?.primitive.kind !== 'text-stub') {
    throw new Error('expected a text-stub primitive')
  }
  return result.primitive.drawLines[0]!.y
}

beforeAll(() => {
  loadBundledTestFont(FONT)
})

describe('multiline anchors each line like upstream draw_multiline', () => {
  it("defaults to `lm`: the first line's baseline is y + (ascender + descender) / 2", () => {
    const font = loadBundledTestFont(FONT)
    const { ascender, descender } = getFontMetrics(font, SIZE)
    // opentype descender is negative, Pillow's is positive, so Pillow's
    // (ascent - descent) / 2 is our (ascender + descender) / 2.
    const expected = 10 + (ascender + descender) / 2

    expect(multilinePrimitive(maintainerMultiline()).drawLines[0]!.y).toBeCloseTo(expected, 4)
  })

  it('reproduces the maintainer side-by-side gap: multiline sits ABOVE text at the same y', () => {
    // Upstream: text `lt` puts its ink top at y=10, multiline `lm` puts the
    // metric middle at y=10 — so the multiline baseline is HIGHER (smaller y)
    // than the text baseline. Our canvas used to place it lower.
    const multilineFirstBaseline = multilinePrimitive(maintainerMultiline()).drawLines[0]!.y

    expect(multilineFirstBaseline).toBeLessThan(textBaseline())
  })

  it('matches the upstream algorithm line for line', () => {
    const font = loadBundledTestFont(FONT)
    const { ascender, descender } = getFontMetrics(font, SIZE)
    // Straight transcription of draw_multiline: current_y starts at y and
    // gains offset_y per line; each line is drawn with anchor `lm`.
    const expected = [0, 1, 2].map((index) => 10 + index * 26 + (ascender + descender) / 2)

    const actual = multilinePrimitive(maintainerMultiline()).drawLines.map((line) => line.y)

    expect(actual).toHaveLength(3)
    actual.forEach((baseline, index) => {
      expect(baseline).toBeCloseTo(expected[index]!, 4)
    })
  })

  it('spans from the first line to the last, so a first-line shift alone is caught', () => {
    const font = loadBundledTestFont(FONT)
    const { ascender, descender } = getFontMetrics(font, SIZE)
    const ink = measureInkBoundingBox(font, 'Line 1', SIZE)
    const firstBaseline = 10 + (ascender + descender) / 2
    const lastBaseline = firstBaseline + 2 * 26

    const block = multilinePrimitive(maintainerMultiline())

    expect(block.y).toBeCloseTo(firstBaseline + ink.y1, 4)
    expect(block.y + block.height).toBeCloseTo(lastBaseline + ink.y2, 4)
  })

  it('honors an explicit anchor: `lt` puts the first line ink top at y', () => {
    const font = loadBundledTestFont(FONT)
    const ink = measureInkBoundingBox(font, 'Line 1', SIZE)

    const first = multilinePrimitive(maintainerMultiline({ anchor: 'lt' })).drawLines[0]!

    expect(first.y).toBeCloseTo(10 - ink.y1, 4)
  })

  it('honors an explicit anchor: `ls` puts the first line baseline exactly at y', () => {
    expect(multilinePrimitive(maintainerMultiline({ anchor: 'ls' })).drawLines[0]!.y).toBeCloseTo(
      10,
      4,
    )
  })

  it('honors an explicit anchor: `la` puts the ascender line at y', () => {
    const font = loadBundledTestFont(FONT)
    const { ascender } = getFontMetrics(font, SIZE)

    expect(multilinePrimitive(maintainerMultiline({ anchor: 'la' })).drawLines[0]!.y).toBeCloseTo(
      10 + ascender,
      4,
    )
  })

  it('honors an explicit horizontal anchor per line, not per block', () => {
    const font = loadBundledTestFont(FONT)
    // Upstream calls draw.text once per line at the same `x`, so a centering
    // anchor centers each line on x=80 individually.
    const centered = multilinePrimitive(
      maintainerMultiline({ anchor: 'mm', value: 'Line 1|a much longer line' }),
    )

    centered.drawLines.forEach((line) => {
      const ink = measureInkBoundingBox(font, line.text, SIZE)
      expect(line.x + (ink.x1 + ink.x2) / 2).toBeCloseTo(80, 4)
    })
  })

  it('keeps the anchor independent of the line advance', () => {
    const tight = multilinePrimitive(maintainerMultiline({ offset_y: 12 }))
    const loose = multilinePrimitive(maintainerMultiline({ offset_y: 90 }))

    expect(loose.drawLines[0]!.y).toBeCloseTo(tight.drawLines[0]!.y, 4)
  })
})
