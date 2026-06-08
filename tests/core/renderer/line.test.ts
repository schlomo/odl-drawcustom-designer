import { describe, expect, it } from 'vitest'
import { renderLine } from '../../../src/core/renderer/line'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('renderLine', () => {
  it('resolves percentage coordinates', () => {
    const result = renderLine(
      {
        type: 'line',
        x_start: '50%',
        x_end: '100%',
        y_start: '25%',
        y_end: '75%',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      x1: 200,
      x2: 400,
      y1: 50,
      y2: 150,
    })
  })
})
