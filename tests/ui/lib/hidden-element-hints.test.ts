import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTemplateContextToPayload,
  clearFontRegistry,
  clearImageAvailabilityRegistry,
  markFontUnavailable,
  markImageUnavailable,
  renderElement,
  safeRenderElement,
  type DrawElement,
} from '../../../src/core'
import {
  isElementCanvasSelectable,
  resolveElementHitBounds,
  resolveHiddenElementHint,
} from '../../../src/ui/lib/hidden-element-hints'

const context = {
  width: 800,
  height: 480,
  colorMode: 'bwy' as const,
  showHiddenHints: true,
}

describe('hidden element hints', () => {
  it('ghosts icons with fill none after template preview', () => {
    const payload = applyTemplateContextToPayload(
      [
        {
          type: 'icon',
          value: 'mdi:sunglasses',
          x: 150,
          y: 280,
          size: 48,
          fill: "{{ iif(is_state('binary_sensor.window', 'on'), 'black', 'none') }}",
          anchor: 'lm',
        },
      ],
      { states: { 'binary_sensor.window': 'off' } },
    )

    const element = payload[0]!
    const result = renderElement(element, context)
    const hint = resolveHiddenElementHint(element, result, context)

    expect(result?.primitive).toMatchObject({ kind: 'icon', fill: 'none' })
    expect(hint?.reason).toBe('fill_none')
    expect(hint?.bounds).toMatchObject({ width: 48, height: 48 })
  })

  it('ghosts elements with visible false', () => {
    const element = {
      type: 'text' as const,
      value: 'Hidden label',
      x: 10,
      y: 20,
      visible: false,
    }

    expect(renderElement(element, context)).toBeNull()

    const hint = resolveHiddenElementHint(element, null, context)
    expect(hint?.reason).toBe('visible_false')
    expect(hint?.bounds.width).toBeGreaterThan(0)
    expect(resolveElementHitBounds(element, context)).toEqual(hint?.bounds)
  })

  it('ghosts elements with templated visible false', () => {
    const payload = applyTemplateContextToPayload(
      [
        {
          type: 'text',
          value: 'Only when door open',
          x: 10,
          y: 20,
          visible: "{{ is_state('binary_sensor.door', 'on') }}",
        },
      ],
      { states: { 'binary_sensor.door': 'off' } },
    )

    const element = payload[0]!
    expect(renderElement(element, context)).toBeNull()
    expect(resolveHiddenElementHint(element, null, context)?.reason).toBe('visible_false')
  })

  it('does not ghost stroke-only shapes with fill none and outline', () => {
    const rectangle = {
      type: 'rectangle' as const,
      x_start: 10,
      x_end: 50,
      y_start: 20,
      y_end: 60,
      fill: 'none',
      outline: 'black',
    }

    const rectangleResult = renderElement(rectangle, context)
    expect(rectangleResult).not.toBeNull()
    expect(resolveHiddenElementHint(rectangle, rectangleResult, context)).toBeNull()

    const arc = {
      type: 'arc' as const,
      x: 100,
      y: 100,
      radius: 40,
      start_angle: 30,
      end_angle: 330,
      fill: 'none',
      outline: 'black',
      width: 3,
    }

    const arcResult = renderElement(arc, context)
    expect(arcResult).not.toBeNull()
    expect(resolveHiddenElementHint(arc, arcResult, context)).toBeNull()
  })

  it('ghosts icons with fill none', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 0,
      y: 0,
      size: 24,
      fill: 'none',
    }
    const result = renderElement(element, context)

    expect(resolveHiddenElementHint(element, result, context)?.reason).toBe('fill_none')
  })

  it('excludes invisible-on-tag elements from hit bounds when ghost hints are off', () => {
    const invisible = {
      type: 'text' as const,
      value: 'Hidden',
      x: 10,
      y: 20,
      visible: false,
    }
    const fillNoneIcon = {
      type: 'icon' as const,
      value: 'mdi:eye-off',
      x: 0,
      y: 0,
      size: 24,
      fill: 'none',
    }
    const ctx = { ...context, showHiddenHints: false }

    expect(isElementCanvasSelectable(invisible, ctx)).toBe(false)
    expect(isElementCanvasSelectable(fillNoneIcon, ctx)).toBe(false)
    expect(resolveElementHitBounds(invisible, ctx)).toBeNull()
    expect(resolveElementHitBounds(fillNoneIcon, ctx)).toBeNull()
  })

  it('returns null when ghost hints are disabled', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 0,
      y: 0,
      size: 24,
      fill: 'none',
    }
    const result = renderElement(element, context)

    expect(
      resolveHiddenElementHint(element, result, { ...context, showHiddenHints: false }),
    ).toBeNull()
  })

  it('does not throw when rectangle has templated coordinates', () => {
    const element = {
      type: 'rectangle' as const,
      x_start: 0,
      y_start: 0,
      x_end: '{{ }}',
      y_end: 100,
    }

    expect(() => resolveElementHitBounds(element, context)).not.toThrow()
    const bounds = resolveElementHitBounds(element, context)
    expect(bounds).not.toBeNull()
  })
})

/**
 * Maintainer manual-test finding (ba7912f): the red render-error marker, the
 * blue selection frame, and the hit-testable region for an errored element
 * disagreed on both position AND size — a plot's marker was drawn at (0, 0)
 * while the selection frame stayed at the plot's real location, and errored
 * box elements couldn't be dragged at all (the visible marker and the
 * hit-test region for it were different rectangles, so clicking the marker
 * missed the hit target).
 *
 * `resolveElementHitBounds` (used for BOTH hit-testing — `hitTargets` in
 * DesignerCanvas.tsx — and the selection frame — `selectionBounds`/
 * `selectionBoundsByIndex`) and the canvas paint path (`CanvasElementSlot`,
 * which draws `safeRenderElement`'s own primitive) must derive from the
 * exact SAME primitive for an errored element — there must be no second,
 * independently-drifting bounds computation. This is what makes the
 * DesignerCanvas fix (adding `fontLoadOutcomes` to the `hitTargets`/
 * `selectionBounds`/`selectionBoundsByIndex` memo dependencies, so they
 * re-run when a font settles instead of staying pinned to a stale
 * pre-error render) actually restore agreement: once all three consumers
 * call `safeRenderElement` fresh, they get identical geometry by
 * construction, which this test verifies directly.
 *
 * (A true drag-simulation test — real pointer capture through
 * DesignerCanvas's full pointerdown/pointermove session — is out of reach
 * here: DesignerCanvas has ~30 required props and no existing test harness
 * renders it end-to-end. This verifies the root-cause invariant the fix
 * relies on instead: hit-test bounds for a confirmed-missing-font element
 * exactly match its drawn render-error marker, for both a point-anchored
 * and a box-declared element.)
 */
describe('render-error bounds agreement — hit-test bounds must exactly match the drawn marker', () => {
  const ctx = { width: 200, height: 200, colorMode: 'bw' as const }

  afterEach(() => {
    clearFontRegistry()
  })

  it('text (point-anchored): resolveElementHitBounds matches the drawn render-error primitive exactly', () => {
    const key = 'missing-font-hidden-hints-text.ttf'
    markFontUnavailable(key, `${key} is not uploaded.`)
    const element: DrawElement = { type: 'text', value: 'Hello', x: 60, y: 70, font: key }

    const rendered = safeRenderElement(element, ctx)
    if (rendered?.layer !== 'svg' || rendered.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(rendered)}`)
    }

    const hitBounds = resolveElementHitBounds(element, ctx)
    expect(hitBounds).toEqual({
      x: rendered.primitive.x,
      y: rendered.primitive.y,
      width: rendered.primitive.width,
      height: rendered.primitive.height,
    })
  })

  it('plot (box-declared): resolveElementHitBounds matches the drawn render-error primitive exactly', () => {
    const key = 'missing-font-hidden-hints-plot.ttf'
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

    const rendered = safeRenderElement(element, ctx)
    if (rendered?.layer !== 'svg' || rendered.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(rendered)}`)
    }

    const hitBounds = resolveElementHitBounds(element, ctx)
    expect(hitBounds).toEqual({
      x: rendered.primitive.x,
      y: rendered.primitive.y,
      width: rendered.primitive.width,
      height: rendered.primitive.height,
    })
    // Also pins down the actual expectation from the bug report: this must
    // be the plot's real declared rectangle, not (0, 0).
    expect(hitBounds).toMatchObject({ x: 40, y: 20, width: 100, height: 70 })
  })

  it('dlimg (box-declared, issue #55): resolveElementHitBounds matches the drawn render-error primitive exactly', () => {
    const url = '/local/missing-hidden-hints-issue55.png'
    markImageUnavailable(url, `${url} is not uploaded.`)
    const element: DrawElement = { type: 'dlimg', url, x: 25, y: 35, xsize: 60, ysize: 45 }

    const rendered = safeRenderElement(element, ctx)
    if (rendered?.layer !== 'svg' || rendered.primitive.kind !== 'render-error') {
      throw new Error(`expected the dedicated render-error marker, got ${JSON.stringify(rendered)}`)
    }

    const hitBounds = resolveElementHitBounds(element, ctx)
    expect(hitBounds).toEqual({
      x: rendered.primitive.x,
      y: rendered.primitive.y,
      width: rendered.primitive.width,
      height: rendered.primitive.height,
    })
    // Pins down the actual expectation: the image's real declared rectangle
    // (x/y/xsize/ysize), not (0, 0).
    expect(hitBounds).toMatchObject({ x: 25, y: 35, width: 60, height: 45 })

    clearImageAvailabilityRegistry()
  })
})
