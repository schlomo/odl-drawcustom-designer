/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'

/**
 * `getEditStatus()` (issue #133, ADR-018's observability clause) — the
 * edit-tracking half `App`'s `getStatus()`/`onStatusChange` build on:
 * `payloadRevision` and `lastEditAt`. These are hook-level behavior tests of
 * that tracking (not of the embed handle), the same level
 * `use-project-state-history.test.ts` already tests undo/redo at.
 */

const STANDALONE_HOST = createStandaloneHost()

function bootstrapWithText() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Test',
      canvas: { width: 400, height: 300, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
      elements: [
        { type: 'text', value: 'Hello', x: 10, y: 10 },
        { type: 'text', value: 'World', x: 50, y: 50 },
      ],
      updatedAt: 1,
    },
    {},
    'session',
  )
}

describe('useProjectState edit-status tracking (issue #133)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a coalesced drag-like gesture (many intermediate commits) bumps the revision exactly once', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    const before = result.current.getEditStatus()
    expect(before.payloadRevision).toBe(0)
    expect(before.lastEditAt).toBeNull()

    act(() => {
      result.current.beginEditCoalesce()
    })
    // Several intermediate commits — one per simulated pointermove — while
    // the gesture is open. `updateElementsBatch` is exactly what
    // `DesignerCanvas`'s drag handler calls per move.
    for (let x = 11; x <= 15; x += 1) {
      act(() => {
        result.current.updateElementsBatch(new Map([[0, { type: 'text', value: 'Hello', x, y: 10 }]]))
      })
    }
    // Not yet — the gesture hasn't ended.
    expect(result.current.getEditStatus().payloadRevision).toBe(0)

    act(() => {
      result.current.endEditCoalesce()
    })

    const after = result.current.getEditStatus()
    expect(after.payloadRevision).toBe(1)
    expect(after.lastEditAt).not.toBeNull()
  })

  it('a coalesced gesture that starts and ends without net change bumps nothing', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    act(() => {
      result.current.beginEditCoalesce()
      result.current.endEditCoalesce()
    })

    const status = result.current.getEditStatus()
    expect(status.payloadRevision).toBe(0)
    expect(status.lastEditAt).toBeNull()
  })

  it('a stray endEditCoalesce() with no matching begin is a no-op for the edit status', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    act(() => {
      result.current.endEditCoalesce()
    })

    const status = result.current.getEditStatus()
    expect(status.payloadRevision).toBe(0)
    expect(status.lastEditAt).toBeNull()
  })

  it('an out-of-range updateElement() no-op does not bump the revision or lastEditAt (NIT 7)', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    act(() => {
      result.current.updateElement(99, { type: 'text', value: 'Ignored', x: 0, y: 0 })
    })

    const status = result.current.getEditStatus()
    expect(status.payloadRevision).toBe(0)
    expect(status.lastEditAt).toBeNull()
    // Confirms it was genuinely a no-op, not a silently-swallowed real edit.
    expect(result.current.elements).toHaveLength(2)
  })

  it('a real (in-range) updateElement() outside any coalesce span bumps both fields once', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    act(() => {
      result.current.updateElement(0, { type: 'text', value: 'Changed', x: 10, y: 10 })
    })

    const status = result.current.getEditStatus()
    expect(status.payloadRevision).toBe(1)
    expect(status.lastEditAt).not.toBeNull()
  })

  it('undo and redo each bump the revision and lastEditAt — both are user-originated', () => {
    const { result } = renderHook(() => useProjectState(bootstrapWithText(), STANDALONE_HOST))

    act(() => {
      result.current.updateElement(0, { type: 'text', value: 'Changed', x: 10, y: 10 })
    })
    const afterEdit = result.current.getEditStatus()
    expect(afterEdit.payloadRevision).toBe(1)

    act(() => {
      result.current.undo()
    })
    const afterUndo = result.current.getEditStatus()
    expect(afterUndo.payloadRevision).toBe(2)
    expect(afterUndo.lastEditAt).not.toBeNull()
    expect(result.current.elements[0]?.value).toBe('Hello')

    act(() => {
      result.current.redo()
    })
    const afterRedo = result.current.getEditStatus()
    expect(afterRedo.payloadRevision).toBe(3)
    expect(result.current.elements[0]?.value).toBe('Changed')
  })
})
