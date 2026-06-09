import { describe, expect, it } from 'vitest'
import { clampHexToColorMode } from '../../../src/core/display/palette-clamp'
import { renderCircle } from '../../../src/core/renderer/circle'
import { resolvePreviewPaint } from '../../../src/core/renderer/preview-paint'
import { renderProgressBar } from '../../../src/core/renderer/progress-bar'

describe('WYSIWYG palette clamp (no primary name remapping)', () => {
  it('clamps literal red to nearest BWY palette (same as a red dlimg pixel)', () => {
    expect(clampHexToColorMode('#FF0000', 'bwy')).toBe('#808080')
    expect(resolvePreviewPaint('red', { colorMode: 'bwy' })).toBe('#808080')
  })

  it('clamps literal yellow to grey on BWR (same as a yellow dlimg pixel)', () => {
    expect(clampHexToColorMode('#FFFF00', 'bwr')).toBe('#808080')
    expect(resolvePreviewPaint('yellow', { colorMode: 'bwr' })).toBe('#808080')
  })

  it('maps accent via tag accent mode, then clamps', () => {
    expect(resolvePreviewPaint('accent', { colorMode: 'bwy' })).toBe('#FFFF00')
    expect(resolvePreviewPaint('accent', { colorMode: 'bwr' })).toBe('#FF0000')
  })

  it('applies the same clamp to circle and progress bar fills on BWY', () => {
    const bwy = { width: 800, height: 480, colorMode: 'bwy' as const }
    const expected = resolvePreviewPaint('red', bwy)

    const circle = renderCircle({ type: 'circle', x: 10, y: 10, radius: 5, fill: 'red' }, bwy)
    const bar = renderProgressBar(
      {
        type: 'progress_bar',
        x_start: 0,
        x_end: 100,
        y_start: 0,
        y_end: 20,
        progress: 50,
        fill: 'red',
      },
      bwy,
    )

    if (circle?.layer === 'svg' && circle.primitive.kind === 'circle') {
      expect(circle.primitive.fill).toBe(expected)
    }
    if (bar?.layer === 'svg' && bar.primitive.kind === 'progress-bar-stub') {
      expect(bar.primitive.fill.fill).toBe(expected)
    }
  })

  it('applies the same grey clamp to circle and progress bar fills on BWR', () => {
    const bwr = { width: 800, height: 480, colorMode: 'bwr' as const }
    const expected = resolvePreviewPaint('yellow', bwr)

    const circle = renderCircle({ type: 'circle', x: 10, y: 10, radius: 5, fill: 'yellow' }, bwr)
    const bar = renderProgressBar(
      {
        type: 'progress_bar',
        x_start: 0,
        x_end: 100,
        y_start: 0,
        y_end: 20,
        progress: 50,
        fill: 'yellow',
      },
      bwr,
    )

    expect(expected).toBe('#808080')
    if (circle?.layer === 'svg' && circle.primitive.kind === 'circle') {
      expect(circle.primitive.fill).toBe(expected)
    }
    if (bar?.layer === 'svg' && bar.primitive.kind === 'progress-bar-stub') {
      expect(bar.primitive.fill.fill).toBe(expected)
    }
  })
})
