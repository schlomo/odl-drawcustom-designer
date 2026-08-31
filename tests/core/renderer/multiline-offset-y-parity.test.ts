import { beforeAll, describe, expect, it } from 'vitest'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import type { RenderContext } from '../../../src/core/renderer/types'
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

  it('ignores `spacing`, which upstream draw_multiline never reads', () => {
    const without = lineAdvances(multiline())
    const withSpacing = lineAdvances(multiline({ spacing: 40 }))

    expect(withSpacing).toHaveLength(without.length)
    withSpacing.forEach((advance, index) => {
      expect(advance).toBeCloseTo(without[index]!, 6)
    })
  })

  it('honors offset_y on the parse_colors path too', () => {
    const advances = lineAdvances(
      multiline({ value: '[red]One[/red]|Two|[black]Three[/black]', parse_colors: true }),
    )

    for (const advance of advances) {
      expect(advance).toBeCloseTo(90, 6)
    }
  })
})
