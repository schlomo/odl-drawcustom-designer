import { beforeAll, describe, expect, it } from 'vitest'
import {
  parseYamlPayload,
  renderMultiline,
  serializeYamlPayload,
  type RenderContext,
} from '../../../src/core'
import { alignElementsInUnion } from '../../../src/ui/lib/align-elements'
import { nudgeElementsAtIndices } from '../../../src/ui/lib/batch-element-updates'
import { translateElement } from '../../../src/ui/lib/element-geometry'
import { loadBundledTestFont } from '../../core/renderer/font-test-utils'

/**
 * Regression guard: `offset_y` on a `multiline` element is *line spacing*
 * (docs/spec/supported_types.md: "Vertical spacing between lines"), not a
 * position. Dragging, nudging or aligning an element is a position change and
 * must never rewrite a typographic property.
 */

const context: RenderContext = { width: 400, height: 300, colorMode: 'bwr' }

function multiline(overrides: Record<string, unknown> = {}) {
  return {
    type: 'multiline' as const,
    value: 'One|Two|Three',
    delimiter: '|',
    x: 10,
    y: 30,
    offset_y: 40,
    size: 20,
    font: 'ppb.ttf',
    ...overrides,
  }
}

/** Vertical advance between consecutive rendered lines — the visible line height. */
function renderedLineAdvances(element: ReturnType<typeof multiline>): number[] {
  const result = renderMultiline(element, context)
  if (result?.primitive.kind !== 'multiline-stub') {
    throw new Error('expected a multiline-stub primitive')
  }
  const ys = result.primitive.drawLines.map((line) => line.y)
  return ys.slice(1).map((y, index) => y - ys[index]!)
}

/** Line advances are floating-point glyph metrics — compare within tolerance. */
function expectSameLineAdvances(
  after: ReturnType<typeof multiline>,
  before: ReturnType<typeof multiline>,
): void {
  const advancesBefore = renderedLineAdvances(before)
  const advancesAfter = renderedLineAdvances(after)
  expect(advancesAfter).toHaveLength(advancesBefore.length)
  advancesAfter.forEach((advance, index) => {
    expect(advance).toBeCloseTo(advancesBefore[index]!, 6)
  })
}

function renderedBlockTop(element: ReturnType<typeof multiline>): number {
  const result = renderMultiline(element, context)
  if (result?.primitive.kind !== 'multiline-stub') {
    throw new Error('expected a multiline-stub primitive')
  }
  return result.primitive.drawLines[0]!.y
}

beforeAll(() => {
  loadBundledTestFont()
})

describe('dragging a multiline element changes position only', () => {
  it('leaves offset_y untouched and moves y by the drag delta', () => {
    const moved = translateElement(multiline(), 15, 25)

    expect(moved).toMatchObject({ x: 25, y: 55, offset_y: 40 })
  })

  it('keeps offset_y out of the drag in the serialized YAML payload', () => {
    const before = multiline()
    const after = translateElement(before, 0, 25)

    const exported = parseYamlPayload(serializeYamlPayload([after]))[0] as Record<string, unknown>

    expect(exported.offset_y).toBe(40)
    expect(exported.y).toBe(55)
  })

  it('survives a YAML round trip without drifting line spacing over repeated drags', () => {
    let element = multiline()
    for (const dy of [12, -5, 30, -7]) {
      element = translateElement(element, 0, dy) as ReturnType<typeof multiline>
      element = parseYamlPayload(serializeYamlPayload([element]))[0] as ReturnType<typeof multiline>
    }

    expect(element.offset_y).toBe(40)
    expect(element.y).toBe(60)
  })

  it('renders the same line spacing before and after a drag, moving the block only', () => {
    const before = multiline()
    const after = translateElement(before, 0, 37) as ReturnType<typeof multiline>

    expectSameLineAdvances(after, before)
    expect(renderedBlockTop(after) - renderedBlockTop(before)).toBeCloseTo(37, 6)
  })

  it('never drives offset_y negative when dragged upward past its spacing', () => {
    const moved = translateElement(multiline({ y: 200, offset_y: 40 }), 0, -120)

    expect(moved).toMatchObject({ y: 80, offset_y: 40 })
  })

  it('moves a y-less multiline by the drag delta without changing its spacing', () => {
    // With no `y`, the renderer starts the block at `offset_y`
    // (src/core/renderer/multiline.ts). A drag must materialize `y` from that
    // effective start, not repurpose the spacing value.
    const before = multiline({ y: undefined })
    const after = translateElement(before, 0, 25) as ReturnType<typeof multiline>

    expect(after.offset_y).toBe(40)
    expect(after.y).toBe(65)
    expectSameLineAdvances(after, before)
    expect(renderedBlockTop(after) - renderedBlockTop(before)).toBeCloseTo(25, 6)
  })

  it('leaves offset_y alone on a keyboard nudge', () => {
    const nudged = nudgeElementsAtIndices([multiline()], [0], 0, 1, {
      canvas: { width: 400, height: 300 },
    })

    expect(nudged[0]).toMatchObject({ y: 31, offset_y: 40 })
  })

  it('leaves offset_y alone when aligned to another element', () => {
    const elements = [
      multiline(),
      { type: 'text' as const, value: 'anchor', x: 0, y: 120, size: 20 },
    ]
    const bounds = new Map([
      [0, { x: 10, y: 30, width: 60, height: 90 }],
      [1, { x: 0, y: 120, width: 60, height: 20 }],
    ])

    // 'bottom' is the direction that actually moves the multiline here
    // (union bottom 140 vs its own 120), so the assertion is not vacuous.
    const aligned = alignElementsInUnion(elements, [0, 1], bounds, 'bottom', {
      width: 400,
      height: 300,
    })

    expect(aligned[0]).toMatchObject({ y: 50, offset_y: 40 })
  })
})
