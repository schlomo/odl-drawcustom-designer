/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'
import type { ElementBounds } from '../../../src/ui/lib/primitive-bounds'

function bootstrapWithText() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Test',
      canvas: {
        width: 400,
        height: 300,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Hello', x: 10, y: 10 }],
      updatedAt: 1,
    },
    {},
    'session',
  )
}

describe('useProjectState history integration', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('add → undo → redo restores elements and selection', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    expect(result.current.elements).toHaveLength(1)
    expect(result.current.canUndo).toBe(false)

    act(() => {
      const added = result.current.addElement('rectangle')
      expect(added.ok).toBe(true)
    })

    expect(result.current.elements).toHaveLength(2)
    expect(result.current.selectedIndices).toEqual([1])
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements).toHaveLength(1)
    expect(result.current.selectedIndices).toEqual([])
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.redo()
    })

    expect(result.current.elements).toHaveLength(2)
    expect(result.current.selectedIndices).toEqual([1])
    expect(result.current.elements[1]?.type).toBe('rectangle')
  })

  it('multi-select align → undo restores original positions', () => {
    const { result } = renderHook(() =>
      useProjectState(
        buildAppBootstrap(
          {
            id: 'current',
            name: 'Align test',
            canvas: {
              width: 400,
              height: 300,
              rotation: 0,
              colorMode: 'bwr',
              previewDitherMode: 0,
            },
            elements: [
              { type: 'rectangle', x_start: 10, y_start: 10, x_end: 30, y_end: 30 },
              { type: 'rectangle', x_start: 50, y_start: 20, x_end: 80, y_end: 40 },
            ],
            updatedAt: 1,
          },
          {},
          'session',
        ),
      ),
    )

    const boundsByIndex = new Map<number, ElementBounds>([
      [0, { x: 10, y: 10, width: 20, height: 20 }],
      [1, { x: 50, y: 20, width: 30, height: 20 }],
    ])

    act(() => {
      result.current.selectElement(0, { additive: true })
      result.current.selectElement(1, { additive: true })
    })

    act(() => {
      result.current.alignSelection('left', boundsByIndex)
    })

    expect(result.current.elements[1]).toMatchObject({ x_start: 10, x_end: 40 })

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements[0]).toMatchObject({ x_start: 10, x_end: 30 })
    expect(result.current.elements[1]).toMatchObject({ x_start: 50, x_end: 80 })
    expect(result.current.selectedIndices).toEqual([0, 1])
  })

  it('restores persisted undo depth from session bootstrap', () => {
    const { result } = renderHook(() =>
      useProjectState(
        buildAppBootstrap(
          {
            id: 'current',
            name: 'Restore history',
            canvas: {
              width: 400,
              height: 300,
              rotation: 0,
              colorMode: 'bwr',
              previewDitherMode: 0,
            },
            elements: [{ type: 'text', value: 'Current', x: 0, y: 0 }],
            editHistory: {
              undoStack: [
                {
                  elements: [{ type: 'text', value: 'Previous', x: 0, y: 0 }],
                  canvas: {
                    width: 400,
                    height: 300,
                    rotation: 0,
                    colorMode: 'bwr',
                    previewDitherMode: 0,
                  },
                  selectedIndices: [],
                },
              ],
              redoStack: [],
            },
            updatedAt: 1,
          },
          {},
          'session',
        ),
      ),
    )

    expect(result.current.canUndo).toBe(true)
    expect(result.current.elements[0]).toMatchObject({ value: 'Current' })

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements[0]).toMatchObject({ value: 'Previous' })
  })

  it('clears history when loading a different example design', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    act(() => {
      result.current.addElement('rectangle')
    })
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.loadExample('sample-dashboard')
    })

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('does not record undo when only the template preview clock advances', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 8, 10, 44, 0))

    const { result } = renderHook(() =>
      useProjectState(
        buildAppBootstrap(
          {
            id: 'current',
            name: 'Clock preview',
            canvas: {
              width: 400,
              height: 300,
              rotation: 0,
              colorMode: 'bwr',
              previewDitherMode: 0,
            },
            elements: [
              {
                type: 'text',
                value: "{{ now().strftime('%H:%M') }}",
                x: 776,
                y: 30,
              },
            ],
            updatedAt: 1,
          },
          {},
          'session',
        ),
      ),
    )

    expect(result.current.canUndo).toBe(false)
    expect(result.current.elements[0]).toMatchObject({
      value: "{{ now().strftime('%H:%M') }}",
    })
    expect(result.current.previewElements[0]).toMatchObject({ value: '10:44' })

    act(() => {
      vi.advanceTimersByTime(61_000)
    })

    expect(result.current.previewElements[0]).toMatchObject({ value: '10:45' })
    expect(result.current.elements[0]).toMatchObject({
      value: "{{ now().strftime('%H:%M') }}",
    })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.historyUndoDepth).toBe(0)

    vi.useRealTimers()
  })

  it('skips history for no-op YAML source replacements', () => {
    const bootstrap = buildAppBootstrap(
      {
        id: 'current',
        name: 'No-op yaml',
        canvas: {
          width: 400,
          height: 300,
          rotation: 0,
          colorMode: 'bwr',
          previewDitherMode: 0,
        },
        elements: [
          {
            type: 'text',
            value: "{{ now().strftime('%H:%M') }}",
            x: 776,
            y: 30,
          },
        ],
        updatedAt: 1,
      },
      {},
      'session',
    )

    const { result } = renderHook(() => useProjectState(bootstrap))

    act(() => {
      result.current.setElements(structuredClone(bootstrap.elements))
    })

    expect(result.current.canUndo).toBe(false)
  })

  it('coalesces canvas drag updates into one undo step', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    const beforeX = result.current.elements[0]?.type === 'text' ? result.current.elements[0].x : 0

    act(() => {
      result.current.beginEditCoalesce()
      result.current.updateElement(0, {
        type: 'text',
        value: 'Hello',
        x: beforeX + 5,
        y: 10,
      })
      result.current.updateElement(0, {
        type: 'text',
        value: 'Hello',
        x: beforeX + 15,
        y: 10,
      })
      result.current.endEditCoalesce()
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.historyUndoDepth).toBe(1)

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements[0]).toMatchObject({ x: beforeX, y: 10 })
  })

  it('coalesces property panel edits into one undo step', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    const beforeX = result.current.elements[0]?.type === 'text' ? result.current.elements[0].x : 0

    act(() => {
      result.current.beginEditCoalesce()
      result.current.updateElementProperty(0, 'x', beforeX + 5)
      result.current.updateElementProperty(0, 'x', beforeX + 15)
      result.current.endEditCoalesce()
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.historyUndoDepth).toBe(1)

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements[0]).toMatchObject({ x: beforeX, y: 10 })
  })

  it('does not record display config changes in undo history', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    act(() => {
      result.current.applyResolution(296, 128)
      result.current.setColorMode('bwy')
      result.current.setRotation(90)
      result.current.togglePreviewDither()
    })

    expect(result.current.canvas).toMatchObject({
      width: 296,
      height: 128,
      colorMode: 'bwy',
      rotation: 90,
      previewDitherMode: 2,
    })
    expect(result.current.canUndo).toBe(false)

    act(() => {
      result.current.addElement('rectangle')
    })
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements).toHaveLength(1)
    expect(result.current.canvas).toMatchObject({
      width: 296,
      height: 128,
      colorMode: 'bwy',
      rotation: 90,
      previewDitherMode: 2,
    })
  })

  it('does not revert display config when undoing YAML edits made earlier', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText()))

    act(() => {
      result.current.addElement('rectangle')
    })

    act(() => {
      result.current.setColorMode('bwy')
      result.current.togglePreviewDither()
    })

    act(() => {
      result.current.undo()
    })

    expect(result.current.elements).toHaveLength(1)
    expect(result.current.canvas.colorMode).toBe('bwy')
    expect(result.current.canvas.previewDitherMode).toBe(2)
  })
})
