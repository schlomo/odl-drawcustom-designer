import { describe, expect, it } from 'vitest'
import {
  cloneEditSnapshot,
  EditHistory,
  EDIT_HISTORY_MAX,
  snapshotsEqual,
  type EditSnapshot,
} from '../../../src/ui/lib/edit-history'

function snapshot(overrides: Partial<EditSnapshot> = {}): EditSnapshot {
  return {
    elements: [{ type: 'text', value: 'A', x: 0, y: 0 }],
    canvas: {
      width: 400,
      height: 300,
      rotation: 0,
      accentMode: 'red',
      previewDitherMode: 0,
    },
    service: undefined,
    selectedIndices: [0],
    ...overrides,
  }
}

describe('EditHistory', () => {
  it('pushes undo entries and restores on undo/redo', () => {
    const history = new EditHistory()
    const initial = snapshot()
    const changed = snapshot({
      elements: [{ type: 'text', value: 'B', x: 5, y: 5 }],
    })

    history.recordBefore(initial)
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    const restored = history.undo(changed)
    expect(restored).toEqual(cloneEditSnapshot(initial))
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)

    const redone = history.redo(initial)
    expect(redone).toEqual(cloneEditSnapshot(changed))
  })

  it('clears redo when a new mutation is recorded', () => {
    const history = new EditHistory()
    const first = snapshot()
    const second = snapshot({ selectedIndices: [] })
    const third = snapshot({ elements: [] })

    history.recordBefore(first)
    history.undo(second)
    expect(history.canRedo).toBe(true)

    history.recordBefore(second)
    expect(history.canRedo).toBe(false)

    history.recordBefore(third)
    expect(history.undoDepth).toBe(2)
  })

  it(`trims undo stack to ${EDIT_HISTORY_MAX} entries`, () => {
    const history = new EditHistory()
    for (let index = 0; index < EDIT_HISTORY_MAX + 5; index += 1) {
      history.recordBefore(
        snapshot({
          elements: [{ type: 'text', value: String(index), x: index, y: 0 }],
        }),
      )
    }
    expect(history.undoDepth).toBe(EDIT_HISTORY_MAX)
  })

  it('coalesces drag mutations into one undo step at pointer up', () => {
    const history = new EditHistory()
    const before = snapshot({
      elements: [{ type: 'icon', value: 'home', x: 10, y: 10, size: 24 }],
    })
    const midDrag = snapshot({
      elements: [{ type: 'icon', value: 'home', x: 20, y: 10, size: 24 }],
    })
    const afterDrag = snapshot({
      elements: [{ type: 'icon', value: 'home', x: 30, y: 10, size: 24 }],
    })

    history.beginCoalesce(before)
    expect(history.isCoalescing()).toBe(true)
    history.recordBefore(midDrag)
    expect(history.undoDepth).toBe(0)

    history.endCoalesce(afterDrag)
    expect(history.isCoalescing()).toBe(false)
    expect(history.undoDepth).toBe(1)

    const restored = history.undo(afterDrag)
    expect(restored?.elements[0]).toMatchObject({ x: 10, y: 10 })
  })

  it('exports and reloads undo/redo stacks for session persistence', () => {
    const history = new EditHistory()
    const first = snapshot()
    const second = snapshot({
      elements: [{ type: 'text', value: 'B', x: 1, y: 0 }],
    })
    const third = snapshot({
      elements: [{ type: 'text', value: 'C', x: 2, y: 0 }],
    })

    history.recordBefore(first)
    history.recordBefore(second)
    history.undo(third)

    const exported = history.exportStacks()
    expect(exported.undoStack).toHaveLength(1)
    expect(exported.redoStack).toHaveLength(1)

    const restored = new EditHistory()
    restored.loadStacks(exported)
    expect(restored.undoDepth).toBe(1)
    expect(restored.redoDepth).toBe(1)
    expect(restored.undo(third)).toEqual(cloneEditSnapshot(first))
  })

  it('skips duplicate recordBefore snapshots', () => {
    const history = new EditHistory()
    const state = snapshot()

    history.recordBefore(state)
    history.recordBefore(cloneEditSnapshot(state))

    expect(history.undoDepth).toBe(1)
  })

  it('skips coalesced undo when drag did not change state', () => {
    const history = new EditHistory()
    const before = snapshot()

    history.beginCoalesce(before)
    history.endCoalesce(before)

    expect(history.undoDepth).toBe(0)
  })
})

describe('snapshotsEqual', () => {
  it('detects element changes', () => {
    const left = snapshot()
    const right = snapshot({
      elements: [{ type: 'text', value: 'changed', x: 0, y: 0 }],
    })
    expect(snapshotsEqual(left, right)).toBe(false)
    expect(snapshotsEqual(left, cloneEditSnapshot(left))).toBe(true)
  })
})
