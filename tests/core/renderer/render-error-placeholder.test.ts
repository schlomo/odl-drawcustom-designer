import { afterEach, describe, expect, it } from 'vitest'
import { registerFont, unregisterFont } from '../../../src/core/renderer/fonts'
import { safeRenderElement } from '../../../src/core/renderer'
import type { DrawElement, RenderContext } from '../../../src/core'

/**
 * safeRenderElement must never let a render-time exception vanish an element
 * completely. Before this fix, any throw inside renderElement() (font metrics,
 * layout math, etc.) was swallowed and the element disappeared with no trace —
 * not even a bounding box or selection outline (issue #10).
 *
 * We force a throw generically (a font registered with no opentype.Font API)
 * rather than reproducing the variable-font bug — that's a separate fix.
 */
describe('safeRenderElement — render failures never vanish the element', () => {
  const ctx: RenderContext = { width: 200, height: 200, colorMode: 'bw' }
  const BROKEN_FONT_KEY = 'broken-render-error-placeholder.ttf'

  afterEach(() => {
    unregisterFont(BROKEN_FONT_KEY)
  })

  it('returns a non-null placeholder result with visible bounds and a surfaced error when render throws', () => {
    // Not a real opentype.Font — renderText's layout code will throw
    // (font.getAdvanceWidth is not a function) once it tries to measure text.
    registerFont(BROKEN_FONT_KEY, {} as never)

    const element: DrawElement = {
      type: 'text',
      value: 'Hello',
      x: 10,
      y: 20,
      font: BROKEN_FONT_KEY,
    }

    const result = safeRenderElement(element, ctx)

    expect(result).not.toBeNull()
    expect(result?.error).toBeTruthy()
    expect(result?.error).toContain('getAdvanceWidth')

    if (result?.layer !== 'svg' || result.primitive.kind !== 'rect') {
      throw new Error(`expected an svg rect placeholder, got ${JSON.stringify(result)}`)
    }
    // Bounds must be a real, visible box — not zero-area / NaN.
    expect(Number.isFinite(result.primitive.x)).toBe(true)
    expect(Number.isFinite(result.primitive.y)).toBe(true)
    expect(result.primitive.width).toBeGreaterThan(0)
    expect(result.primitive.height).toBeGreaterThan(0)
  })

  it('still returns null for a deliberately invisible element (visible: false) — not an error case', () => {
    const element: DrawElement = {
      type: 'text',
      value: 'Hidden',
      x: 0,
      y: 0,
      visible: false,
    }

    const result = safeRenderElement(element, ctx)

    expect(result).toBeNull()
  })
})
