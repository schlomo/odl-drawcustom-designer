import { describe, expect, it } from 'vitest'
import { applyTemplateContextToPayload, renderElement } from '../../../src/core'
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
})
