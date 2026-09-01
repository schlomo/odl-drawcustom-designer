import { beforeAll, describe, expect, it } from 'vitest'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import { measureInkBoundingBox } from '../../../src/core/renderer/text-ink-bounds'
import type { RenderContext } from '../../../src/core/renderer/types'
import { parseYamlPayload, validatePayload } from '../../../src/core/yaml'
import { loadBundledTestFont } from './font-test-utils'

/**
 * Issue #169 — HA render parity (ADR-007) for `multiline` line advance.
 *
 * Authoritative upstream implementation, `odl_renderer/elements/text.py`,
 * `draw_multiline`:
 *
 *     offset_y = int(coerce_number(element["offset_y"]))
 *     ...
 *     for line in lines:
 *         draw.text((x, current_y), str(line), ...)
 *         current_y += offset_y
 *
 * So `offset_y` IS the per-line advance, in absolute pixels — not an addition
 * to the font's natural line height, and not a position. It is a required
 * field upstream (`requires=["x", "value", "delimiter", "offset_y"]`).
 *
 * `spacing` is never read by `draw_multiline` at all — it belongs to
 * `draw_text` (`spacing = element.get("spacing", 5)`, Pillow's multi-line
 * spacing for `\n`-wrapped text). The client had these exactly inverted: it
 * used `spacing` as the advance and ignored `offset_y` entirely.
 *
 * Per ADR-011 these assert rendered geometry off the render path, not markup.
 */

const context: RenderContext = { width: 400, height: 400, colorMode: 'bwr' }

function multiline(overrides: Record<string, unknown> = {}) {
  return {
    type: 'multiline' as const,
    value: 'One|Two|Three',
    delimiter: '|',
    x: 10,
    y: 40,
    offset_y: 90,
    size: 24,
    font: 'ppb.ttf',
    ...overrides,
  }
}

function primitive(element: ReturnType<typeof multiline>) {
  const result = renderMultiline(element, context)
  if (result?.primitive.kind !== 'multiline-stub') {
    throw new Error('expected a multiline-stub primitive')
  }
  return result.primitive
}

/** Vertical advance between consecutive rendered lines. */
function lineAdvances(element: ReturnType<typeof multiline>): number[] {
  const ys = primitive(element).drawLines.map((line) => line.y)
  return ys.slice(1).map((y, index) => y - ys[index]!)
}

beforeAll(() => {
  loadBundledTestFont()
})

describe('multiline honors offset_y as the line advance (#169)', () => {
  it('advances each line by exactly offset_y', () => {
    for (const advance of lineAdvances(multiline({ offset_y: 90 }))) {
      expect(advance).toBeCloseTo(90, 6)
    }
  })

  it('tracks offset_y across values, not the font default line height', () => {
    for (const offsetY of [12, 30, 64, 120]) {
      for (const advance of lineAdvances(multiline({ offset_y: offsetY }))) {
        expect(advance).toBeCloseTo(offsetY, 6)
      }
    }
  })

  it('starts the first line at the same place regardless of offset_y', () => {
    const tight = primitive(multiline({ offset_y: 20 }))
    const loose = primitive(multiline({ offset_y: 120 }))

    expect(loose.drawLines[0]!.y).toBeCloseTo(tight.drawLines[0]!.y, 6)
  })

  it('grows the block height by exactly one offset_y per extra line', () => {
    const two = primitive(multiline({ value: 'One|Two' }))
    const three = primitive(multiline({ value: 'One|Two|Three' }))

    expect(three.height - two.height).toBeCloseTo(90, 6)
  })

  it('measures the block as one line plus (n-1) advances', () => {
    // Bounds here are ink-bound (positionTextBlockAtAnchor), so the absolute
    // height carries the glyph ink span rather than a nominal line box —
    // compare against the one-line block instead of hard-coding metrics.
    const one = primitive(multiline({ value: 'One', offset_y: 90 }))
    const three = primitive(multiline({ value: 'One|One|One', offset_y: 90 }))

    expect(three.height - one.height).toBeCloseTo(2 * 90, 6)
  })

  it('ignores a stray `spacing`, which upstream draw_multiline never reads', () => {
    // No longer part of the multiline schema, so the editor flags it as an
    // unknown key — but a payload carrying it still loads (parseYamlPayload
    // does not validate), and must render exactly as if it were absent.
    const without = lineAdvances(multiline())
    const withSpacing = lineAdvances(multiline({ spacing: 40 }))

    expect(withSpacing).toHaveLength(without.length)
    withSpacing.forEach((advance, index) => {
      expect(advance).toBeCloseTo(without[index]!, 6)
    })
  })

  it('honors offset_y on the parse_colors path too', () => {
    // Upstream draws coloured segments with a hard-coded `anchor="lt"`, and
    // `t` is ink-relative, so it is each line's INK TOP that steps by exactly
    // offset_y — baselines differ by the lines' differing ink heights.
    const font = loadBundledTestFont()
    const lines = primitive(
      multiline({ value: '[red]One[/red]|Two|[black]Three[/black]', parse_colors: true }),
    ).drawLines
    const inkTops = lines.map(
      (line) => line.y + measureInkBoundingBox(font, line.text, 24).y1,
    )
    const advances = inkTops.slice(1).map((top, index) => top - inkTops[index]!)

    for (const advance of advances) {
      expect(advance).toBeCloseTo(90, 6)
    }
  })
})

/**
 * `spacing` is not a `multiline` field in the language (upstream
 * `draw_multiline` never reads it) so it is not in the designer's schema
 * either. Deliberate handling: **flagged, not stripped and not accepted.**
 *
 * It becomes an unknown key, treated exactly like any other typo — no
 * special-case strip list, and nothing silently deleted from the user's YAML.
 * Loading is unaffected because `parseYamlPayload` does not validate, so an
 * imported or host-pushed payload still renders; only the editor's lint layer
 * objects, on that line, with the text preserved.
 */
describe('multiline no longer accepts `spacing`', () => {
  const withSpacing = `- type: multiline
  value: a|b
  delimiter: "|"
  x: 0
  offset_y: 26
  spacing: 12
`

  it('still loads, so existing payloads do not hard-fail', () => {
    const elements = parseYamlPayload(withSpacing)

    expect(elements).toHaveLength(1)
    expect((elements[0] as Record<string, unknown>).offset_y).toBe(26)
  })

  it('is reported as an unrecognized key rather than silently accepted', () => {
    const result = validatePayload(parseYamlPayload(withSpacing))

    expect(result.success).toBe(false)
    expect(JSON.stringify(result.success ? [] : result.issues)).toContain('spacing')
  })

  it('leaves `spacing` real on `text`, where upstream does read it', () => {
    const result = validatePayload(
      parseYamlPayload(`- type: text
  value: wrapped
  x: 0
  y: 0
  max_width: 40
  spacing: 4
`),
    )

    expect(result.success).toBe(true)
  })
})
