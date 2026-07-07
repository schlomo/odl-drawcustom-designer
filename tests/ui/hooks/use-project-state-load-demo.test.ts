/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import {
  SHOWCASE_CANVAS,
  SHOWCASE_ELEMENTS,
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
} from '../../../src/ui/data/showcase'
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

    expect(result.current.elements).toEqual(SHOWCASE_ELEMENTS)
    expect(result.current.canvas).toEqual(SHOWCASE_CANVAS)
    expect(result.current.selectedIndices).toEqual([])
    expect(result.current.canUndo).toBe(false)
  })

  it('seeds the showcase mock states, attributes, and variables so the demo renders its template features', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithCustomText()))

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.mockContext.states).toMatchObject(SHOWCASE_MOCK_STATES)
    expect(result.current.mockContext.attributes).toEqual(SHOWCASE_MOCK_ATTRIBUTES)
    expect(result.current.mockContext.variables).toEqual(SHOWCASE_VARIABLES)
  })

  it('clears the unmodified demo simulator data for a clean slate', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithCustomText()))

    act(() => {
      result.current.loadDemo()
    })

    act(() => {
      result.current.clearElements()
    })

    expect(result.current.elements).toEqual([])
    expect(result.current.mockContext.states).toEqual({})
    expect(result.current.mockContext.attributes).toEqual({})
    expect(result.current.mockContext.variables).toEqual({})
  })

  it('preserves user-added and user-modified simulator data when clearing', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithCustomText()))

    act(() => {
      result.current.loadDemo()
    })

    act(() => {
      // user-added entity + variable, plus an edit to a demo-seeded state
      result.current.setMockState('sensor.my_power', '1200')
      result.current.setMockState('sensor.temperature', '30')
      result.current.setMockAttribute('sensor.my_power', 'unit', 'W')
      result.current.setVariable('my_theme', 'dark')
    })

    act(() => {
      result.current.clearElements()
    })

    expect(result.current.elements).toEqual([])
    // user data survives
    expect(result.current.mockContext.states).toEqual({
      'sensor.my_power': '1200',
      'sensor.temperature': '30',
    })
    expect(result.current.mockContext.attributes).toEqual({
      'sensor.my_power': { unit: 'W' },
    })
    expect(result.current.mockContext.variables).toEqual({ my_theme: 'dark' })
  })
})
