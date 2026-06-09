import { describe, expect, it } from 'vitest'
import { isVisible } from '../../../src/core/renderer/visibility'
import { renderCircle } from '../../../src/core/renderer/circle'
import { renderLine } from '../../../src/core/renderer/line'
import { renderMultiline } from '../../../src/core/renderer/multiline'
import { renderRectangle } from '../../../src/core/renderer/rectangle'
import { renderText } from '../../../src/core/renderer/text'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderer visibility', () => {
  it('treats unevaluated visible templates as visible until preview', () => {
    expect(
      isVisible("{{ iif(is_state('binary_sensor.door', 'on'), true, false) }}"),
    ).toBe(true)
  })

  it('returns null for line when visible is false', () => {
    expect(
      renderLine(
        { type: 'line', x_start: 0, x_end: 10, y_start: 0, y_end: 10, visible: false },
        context,
      ),
    ).toBeNull()
  })

  it('returns null for text when visible is false', () => {
    expect(
      renderText({ type: 'text', value: 'Hidden', x: 0, y: 0, visible: false }, context),
    ).toBeNull()
  })

  it('returns null for multiline when visible is false', () => {
    expect(
      renderMultiline(
        { type: 'multiline', value: 'a|b', delimiter: '|', x: 0, offset_y: 0, visible: false },
        context,
      ),
    ).toBeNull()
  })

  it('returns null for rectangle when visible is false', () => {
    expect(
      renderRectangle(
        {
          type: 'rectangle',
          x_start: 0,
          x_end: 10,
          y_start: 0,
          y_end: 10,
          visible: 'false',
        },
        context,
      ),
    ).toBeNull()
  })

  it('returns null for circle when visible is false', () => {
    expect(
      renderCircle({ type: 'circle', x: 10, y: 10, radius: 5, visible: false }, context),
    ).toBeNull()
  })
})
