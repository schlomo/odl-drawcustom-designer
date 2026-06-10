/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { SAMPLE_CANVAS, SAMPLE_ELEMENTS } from '../../../src/ui/data/sample-elements'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'

function bootstrapWithCustomText() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Custom',
      canvas: {
        width: 400,
        height: 300,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Custom only', x: 5, y: 5 }],
      updatedAt: 1,
    },
    {},
    'session',
  )
}

describe('useProjectState loadDemo', () => {
  it('loads the curated showcase elements and canvas', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithCustomText()))

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.elements).toEqual(SAMPLE_ELEMENTS)
    expect(result.current.canvas).toEqual(SAMPLE_CANVAS)
    expect(result.current.selectedIndices).toEqual([])
    expect(result.current.canUndo).toBe(false)
  })
})
