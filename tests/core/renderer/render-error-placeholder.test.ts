import { afterEach, describe, expect, it } from 'vitest'
import { clearFontRegistry, markFontUnavailable, registerFont, unregisterFont } from '../../../src/core/renderer/fonts'
import {
  clearImageAvailabilityRegistry,
  markImageUnavailable,
} from '../../../src/core/renderer/image-availability'
import { resolveBounds } from '../../../src/core/renderer/bounds'
import { safeRenderElement } from '../../../src/core/renderer'
import type { DrawElement, RenderContext } from '../../../src/core'

/**
 * safeRenderElement must never let a render-time exception vanish an element
 * completely. Before this fix, any throw inside renderElement() (font metrics,
 * layout math, etc.) was swallowed and the element disappeared with no trace —
 * not even a bounding box or selection outline (issue #10).
 *
 * The fix must show an honest, unmistakable error indicator — never an
 * approximation of the element's real content. A wrong-looking render that
 * could pass for genuine output is worse than a clearly-marked failure, so
 * the result must NOT be a content-shaped primitive (e.g. 'text-stub',
 * 'rect') and MUST be the dedicated 'render-error' marker.
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

  it('returns a non-null render-error marker (never content-shaped) with visible bounds and a surfaced message', () => {
    // Not a real opentype.Font — renderText's layout/metrics code will throw
    // once it tries to measure text. The exact method that throws first
    // (getAdvanceWidth, charToGlyph, ...) is an opentype.js implementation
    // detail that can shift as the renderer's font-handling evolves (e.g.
    // the separate variable-font-parity fix adds a fallback path that
    // throws from a different method for a fake object like this one) —
    // assert only the stable contract: some non-empty error message.
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
    expect(typeof result?.error).toBe('string')

    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(
        `expected the dedicated render-error marker, not a content-shaped primitive, got ${JSON.stringify(result)}`,
      )
    }
    // The primitive itself must never be any of the "real content" kinds.
    expect(result.primitive.kind).not.toBe('text-stub')
    expect(result.primitive.kind).not.toBe('rect')
    // It carries the failure message directly too (not just RenderResult.error).
    expect(result.primitive.message).toBe(result.error)
    // Bounds must be a real, hit-testable box — not zero-area / NaN — so the
    // user can still click the errored element to fix it.
    expect(Number.isFinite(result.primitive.x)).toBe(true)
    expect(Number.isFinite(result.primitive.y)).toBe(true)
    expect(result.primitive.width).toBeGreaterThan(0)
    expect(result.primitive.height).toBeGreaterThan(0)
  })

  it('clamps the placeholder origin so a canvas-edge-anchored element stays visible (issue #10 follow-up)', () => {
    // Right/bottom-anchored elements commonly set x/y to the canvas edge
    // (e.g. x = ctx.width for a right-anchored element). The placeholder's
    // fixed 32px size must not be allowed to start there and clip fully
    // outside the canvas — that vanishes the failed element all over again.
    registerFont(BROKEN_FONT_KEY, {} as never)

    const element: DrawElement = {
      type: 'text',
      value: 'Hello',
      x: ctx.width,
      y: ctx.height,
      font: BROKEN_FONT_KEY,
    }

    const result = safeRenderElement(element, ctx)

    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    const { x, y, width, height } = result.primitive
    const intersectsCanvas = x < ctx.width && x + width > 0 && y < ctx.height && y + height > 0
    expect(intersectsCanvas).toBe(true)
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

/**
 * Maintainer manual-test finding on ba7912f: the placeholder for a `plot`/
 * `progress_bar` (box-declared elements, using x_start/x_end/y_start/y_end
 * rather than a single x/y point) was drawn at the canvas origin (0, 0)
 * instead of the element's real, declared position — because
 * `elementAnchor` (render-error.ts) only ever reads `element.x`/`element.y`,
 * which box-declared elements don't have. The screenshot also showed the
 * blue selection frame at the CORRECT location while the red marker sat at
 * (0, 0) — two different bounds computations disagreeing.
 *
 * The fix must make the placeholder type-aware: box-declared elements get
 * their full declared rectangle (clamped to canvas), not a fixed 32px box
 * at (0, 0).
 */
describe('render-error placeholder geometry matches the element\'s declared position (not (0, 0))', () => {
  const ctx: RenderContext = { width: 200, height: 200, colorMode: 'bw' }
  const BROKEN_FONT_KEY = 'broken-render-error-geometry.ttf'

  afterEach(() => {
    unregisterFont(BROKEN_FONT_KEY)
    clearFontRegistry()
  })

  it('plot: placeholder occupies the plot\'s declared rectangle, not (0, 0)', () => {
    const key = 'missing-font-plot-geometry.ttf'
    markFontUnavailable(key, `${key} is not uploaded.`)

    const element: DrawElement = {
      type: 'plot',
      data: [{ entity: 'sensor.temperature' }],
      x_start: 40,
      x_end: 140,
      y_start: 20,
      y_end: 90,
      font: key,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    const expected = resolveBounds(40, 140, 20, 90, ctx)
    expect(result.primitive).toMatchObject(expected)
  })

  it('progress_bar: placeholder occupies the bar\'s declared rectangle, not (0, 0)', () => {
    const key = 'missing-font-progressbar-geometry.ttf'
    markFontUnavailable(key, `${key} is not uploaded.`)

    const element: DrawElement = {
      type: 'progress_bar',
      x_start: 50,
      y_start: 60,
      x_end: 150,
      y_end: 90,
      progress: 50,
      show_percentage: true,
      font: key,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    const expected = resolveBounds(50, 150, 60, 90, ctx)
    expect(result.primitive).toMatchObject(expected)
  })

  it('debug_grid: placeholder spans the full canvas — the grid has no x/y of its own', () => {
    const key = 'missing-font-debuggrid-geometry.ttf'
    markFontUnavailable(key, `${key} is not uploaded.`)

    const element: DrawElement = { type: 'debug_grid', show_labels: true, font: key }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive).toMatchObject({ x: 0, y: 0, width: ctx.width, height: ctx.height })
  })

  it('text (point-anchored): unchanged — fixed-size box at the real x/y anchor', () => {
    registerFont(BROKEN_FONT_KEY, {} as never)

    const element: DrawElement = { type: 'text', value: 'Hello', x: 60, y: 70, font: BROKEN_FONT_KEY }
    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive.x).toBe(60)
    expect(result.primitive.y).toBe(70)
  })

  it('icon (point-anchored, unknown icon name — issue #56): placeholder sits at the element\'s real x/y, not (0, 0)', () => {
    const element: DrawElement = {
      type: 'icon',
      value: 'not-a-real-mdi-icon',
      x: 60,
      y: 70,
      size: 24,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive.x).toBe(60)
    expect(result.primitive.y).toBe(70)
    expect(result.error).toMatch(/not-a-real-mdi-icon/)
  })

  it('icon_sequence (point-anchored, unknown icon name among valid ones — issue #56): placeholder sits at the element\'s real x/y, not (0, 0)', () => {
    const element: DrawElement = {
      type: 'icon_sequence',
      x: 45,
      y: 55,
      icons: ['home', 'not-a-real-mdi-icon'],
      size: 24,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive.x).toBe(45)
    expect(result.primitive.y).toBe(55)
    expect(result.error).toMatch(/not-a-real-mdi-icon/)
  })

  it('icon (known icon name): still a real icon render, never an error (regression lock)', () => {
    const element: DrawElement = { type: 'icon', value: 'home', x: 10, y: 10, size: 24 }
    const result = safeRenderElement(element, ctx)

    expect(result?.error).toBeUndefined()
    expect(result?.primitive.kind).toBe('icon')
  })

  it('icon_sequence (templated icons list that did not resolve — issue #56 follow-up): placeholder at the real x/y, never the unrelated help-circle stand-in', () => {
    // Simulates what the preview evaluator hands the renderer once a
    // templated `icons` field (jsonOrTemplateSchema) still contains
    // unevaluated `{{ }}` syntax (evaluation never ran, or threw and fell
    // back to the raw text) — there is no real icon list to show.
    const element: DrawElement = {
      type: 'icon_sequence',
      x: 80,
      y: 90,
      icons: "{{ ['home', 'home2'] }}",
      size: 24,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive.x).toBe(80)
    expect(result.primitive.y).toBe(90)
    expect(result.error).toMatch(/icons/i)
  })

  it('icon_sequence (templated icons list recovered as real names): renders the actual icons, not a generic help-circle placeholder', () => {
    // What the preview evaluator's Nunjucks renderString produces for
    // `{{ ['home', 'arrow-right'] }}` today: a comma-joined string.
    const element: DrawElement = {
      type: 'icon_sequence',
      x: 10,
      y: 10,
      icons: 'home,arrow-right',
      size: 24,
    }

    const result = safeRenderElement(element, ctx)

    expect(result?.error).toBeUndefined()
    if (result?.layer !== 'svg' || result.primitive.kind !== 'icon_sequence') {
      throw new Error(`expected a real icon_sequence render, got ${JSON.stringify(result)}`)
    }
    expect(result.primitive.icons.map((icon) => icon.name)).toEqual(['home', 'arrow-right'])
  })

  it('dlimg: placeholder occupies the image\'s declared rectangle (x/y/xsize/ysize), not (0, 0) (issue #55)', () => {
    const url = '/local/missing-issue55.png'
    markImageUnavailable(url, `${url} is not uploaded.`)

    const element: DrawElement = {
      type: 'dlimg',
      url,
      x: 30,
      y: 45,
      xsize: 80,
      ysize: 60,
    }

    const result = safeRenderElement(element, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(result)}`)
    }

    expect(result.primitive).toMatchObject({ x: 30, y: 45, width: 80, height: 60 })

    clearImageAvailabilityRegistry()
  })
})
