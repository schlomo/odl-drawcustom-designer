import { describe, expect, it } from 'vitest'
import { renderDebugGrid } from '../../../src/core/renderer/debug-grid'
import { renderProgressBar } from '../../../src/core/renderer/progress-bar'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('progress bar preview', () => {
  const base = {
    type: 'progress_bar' as const,
    x_start: 10,
    x_end: 210,
    y_start: 10,
    y_end: 40,
    progress: 42,
  }

  it('includes percentage label metadata when show_percentage is enabled', () => {
    const result = renderProgressBar({ ...base, show_percentage: true, font: 'ppb.ttf' }, context)
    expect(result?.primitive).toMatchObject({
      kind: 'progress-bar-stub',
      showPercentage: true,
      percentageColor: '#000000',
      percentageFontSize: expect.any(Number),
      percentageFontKey: 'ppb.ttf',
    })
  })

  it('clamps progress outside 0-100', () => {
    const result = renderProgressBar({ ...base, progress: 150 }, context)
    expect(result?.primitive.progress).toBe(100)
  })

  it('clamps negative outline width to zero', () => {
    const result = renderProgressBar({ ...base, width: -3 }, context)
    expect(result?.primitive.background.strokeWidth).toBe(0)
  })
})

describe('debug grid preview', () => {
  it('includes coordinate labels by default', () => {
    const result = renderDebugGrid({ type: 'debug_grid', font: 'ppb.ttf' }, context)
    expect(result?.primitive).toMatchObject({
      kind: 'debug-grid-stub',
      showLabels: true,
      labelStep: 40,
      labelColor: '#000000',
      labelFontSize: 12,
      labelFontKey: 'ppb.ttf',
    })
  })

  it('omits labels when show_labels is false', () => {
    const result = renderDebugGrid({ type: 'debug_grid', show_labels: false }, context)
    expect(result?.primitive.showLabels).toBeUndefined()
  })

  it('clamps spacing below the designer minimum', () => {
    const result = renderDebugGrid({ type: 'debug_grid', spacing: 0 }, context)
    expect(result?.primitive.spacing).toBe(8)
  })
})
