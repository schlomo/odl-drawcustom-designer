import { describe, expect, it } from 'vitest'
import { renderPolygon } from '../../../src/core/renderer/polygon'
import { safeRenderElement } from '../../../src/core/renderer'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderPolygon', () => {
  it('renders the structured points array unchanged', () => {
    const result = renderPolygon(
      {
        type: 'polygon',
        points: [
          [10, 10],
          [90, 10],
          [50, 70],
        ],
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'polygon',
      points: [
        [10, 10],
        [90, 10],
        [50, 70],
      ],
    })
  })

  describe('templated points evaluated to a string (issue #56 follow-up)', () => {
    it('recovers a JSON array string (e.g. tojson filter output)', () => {
      const result = renderPolygon(
        { type: 'polygon', points: '[[10, 10], [90, 10], [50, 70]]' },
        context,
      )

      expect(result?.primitive).toMatchObject({
        kind: 'polygon',
        points: [
          [10, 10],
          [90, 10],
          [50, 70],
        ],
      })
    })

    it("recovers Nunjucks' flat comma-join of a native pairs list", () => {
      // {{ [[10, 10], [90, 10], [50, 70]] }} stringifies to "10,10,90,10,50,70"
      const result = renderPolygon(
        { type: 'polygon', points: '10,10,90,10,50,70' },
        context,
      )

      expect(result?.primitive).toMatchObject({
        kind: 'polygon',
        points: [
          [10, 10],
          [90, 10],
          [50, 70],
        ],
      })
    })

    it('throws instead of silently rendering the fixed preview triangle for an unresolved template', () => {
      expect(() =>
        renderPolygon({ type: 'polygon', points: '{{ my_points }}' }, context),
      ).toThrow(/points/i)
    })

    it('throws for a string that is not recoverable as coordinate pairs', () => {
      expect(() =>
        renderPolygon({ type: 'polygon', points: 'not points at all' }, context),
      ).toThrow(/points/i)

      // odd number of coordinates cannot form pairs
      expect(() =>
        renderPolygon({ type: 'polygon', points: '10,10,90' }, context),
      ).toThrow(/points/i)
    })

    it('surfaces the failure as a render-error placeholder via safeRenderElement', () => {
      const result = safeRenderElement(
        { type: 'polygon', points: '{{ my_points }}' },
        context,
      )

      expect(result?.primitive.kind).toBe('render-error')
      expect(result?.error).toMatch(/points/i)
    })

    it('reports a clean error when points went missing entirely (UI regression, not a TypeError)', () => {
      const result = safeRenderElement(
        { type: 'polygon', points: undefined } as never,
        context,
      )

      expect(result?.primitive.kind).toBe('render-error')
      expect(result?.error).toMatch(/points/i)
      expect(result?.error).not.toMatch(/cannot read properties/i)
    })
  })
})
