/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'

/**
 * Issue #124, root cause 2 (secondary contributor): `previewElements` re-ran
 * `applyTemplateContextToPayload` over the WHOLE payload on every canvas
 * pointermove — a nunjucks evaluation of every templated field plus a deep
 * clone of every element — even though a drag only ever changes the geometry
 * of the element under the pointer.
 *
 * `applyTemplateContextToPayload` deep-clones, so a reused preview entry is
 * observable as object identity: an element whose stored value did not change
 * (and whose evaluation context did not change) must come back as the SAME
 * preview object it did before. A re-evaluation would necessarily produce a
 * fresh clone.
 */

const STANDALONE_HOST = createStandaloneHost()

const TEMPLATED_TEXT: DrawElement = {
  type: 'text',
  value: '{{ states("sensor.demo") }}',
  x: 10,
  y: 10,
}

const RECTANGLE: DrawElement = {
  type: 'rectangle',
  x_start: 40,
  y_start: 163,
  x_end: 190,
  y_end: 235,
  fill: 'black',
}

function bootstrap() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Test',
      canvas: { width: 400, height: 300, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
      elements: [TEMPLATED_TEXT, RECTANGLE],
      updatedAt: 1,
    },
    { states: { 'sensor.demo': '21.5' }, attributes: {} },
    'session',
  )
}

function movedRectangle(steps: number): DrawElement {
  return {
    ...RECTANGLE,
    x_start: RECTANGLE.x_start + steps * 6,
    y_start: RECTANGLE.y_start + steps * 4,
    x_end: RECTANGLE.x_end + steps * 6,
    y_end: RECTANGLE.y_end + steps * 4,
  } as DrawElement
}

describe('useProjectState previewElements during a canvas drag (issue #124)', () => {
  it('reuses the preview of every element the drag did not touch', () => {
    const { result } = renderHook(() => useProjectState(bootstrap(), STANDALONE_HOST))

    expect(result.current.previewElements[0]).toMatchObject({ value: '21.5' })
    const previewBefore = result.current.previewElements

    // Ten pointermoves, exactly as DesignerCanvas commits them.
    for (let step = 1; step <= 10; step++) {
      act(() => {
        result.current.updateElement(1, movedRectangle(step))
      })
      // The templated text was neither moved nor re-contextualized: its
      // preview object must be the very one produced before the drag.
      expect(result.current.previewElements[0]).toBe(previewBefore[0])
    }

    // The dragged element's own preview does follow the pointer.
    expect(result.current.previewElements[1]).toMatchObject({ x_start: 100, y_start: 203 })
    expect(result.current.previewElements[1]).not.toBe(previewBefore[1])
  })

  it('re-evaluates every templated element when the mock context changes', () => {
    const { result } = renderHook(() => useProjectState(bootstrap(), STANDALONE_HOST))
    const previewBefore = result.current.previewElements

    act(() => {
      result.current.setMockState('sensor.demo', '3.2')
    })

    expect(result.current.previewElements[0]).not.toBe(previewBefore[0])
    expect(result.current.previewElements[0]).toMatchObject({ value: '3.2' })
  })

  it('re-evaluates when an edit introduces a template referencing a new entity', () => {
    const { result } = renderHook(() => useProjectState(bootstrap(), STANDALONE_HOST))

    act(() => {
      result.current.updateElement(1, {
        type: 'text',
        value: '{{ states("sensor.added") }}',
        x: 5,
        y: 5,
      })
    })

    // Unseeded entities are seeded as `unknown` by the effective mock context;
    // the newly referenced one must reach the preview, not a stale context.
    expect(result.current.previewElements[1]).toMatchObject({ value: 'unknown' })
  })
})
