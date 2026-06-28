/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'

function bootstrapWithTemplatedFills() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Variables',
      canvas: { width: 400, height: 300, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
      elements: [
        { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10, fill: '{{ uv_fill }}' },
        { type: 'line', x_start: 0, x_end: 10, y_start: 5, y_end: 5, fill: '{{ uv_fill }}' },
      ],
      updatedAt: 1,
    },
    {},
    'session',
  )
}

function fillOf(element: unknown): string | undefined {
  return (element as { fill?: string }).fill
}

describe('useProjectState — user-defined variables', () => {
  it('adding a variable updates the template preview across fields immediately', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplatedFills()))

    // No variable yet → both templated fills render empty.
    expect(fillOf(result.current.previewElements[0])).toBe('')
    expect(fillOf(result.current.previewElements[1])).toBe('')

    act(() => {
      result.current.addVariable('uv_fill', 'green')
    })

    expect(fillOf(result.current.previewElements[0])).toBe('green')
    expect(fillOf(result.current.previewElements[1])).toBe('green')
    expect(result.current.variables).toEqual({ uv_fill: 'green' })
  })

  it('editing a variable value re-renders the preview', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplatedFills()))

    act(() => {
      result.current.addVariable('uv_fill', 'green')
    })
    act(() => {
      result.current.setVariable('uv_fill', 'red')
    })

    expect(fillOf(result.current.previewElements[0])).toBe('red')
    expect(fillOf(result.current.previewElements[1])).toBe('red')
  })

  it('removing a variable clears the preview again', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplatedFills()))

    act(() => {
      result.current.addVariable('uv_fill', 'green')
    })
    act(() => {
      result.current.removeVariable('uv_fill')
    })

    expect(fillOf(result.current.previewElements[0])).toBe('')
    expect(result.current.variables).toEqual({})
  })
})
