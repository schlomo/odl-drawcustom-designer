import { describe, expect, it } from 'vitest'
import {
  resolveExportCanvasSize,
  resolveExportDitherMode,
} from '../../../src/ui/lib/canvas-png-export'

describe('canvas PNG export helpers', () => {
  it('uses native render dimensions regardless of CSS scale', () => {
    expect(resolveExportCanvasSize({ width: 296, height: 128 })).toEqual({
      width: 296,
      height: 128,
    })
  })

  it('prefers preview dither mode when set to halftone', () => {
    expect(resolveExportDitherMode(2, 0)).toBe(2)
  })

  it('falls back to service dither when preview is flat', () => {
    expect(resolveExportDitherMode(0, 2)).toBe(2)
    expect(resolveExportDitherMode(0, 1)).toBe(0)
  })
})
