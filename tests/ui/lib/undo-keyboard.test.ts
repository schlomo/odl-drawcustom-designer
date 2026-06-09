import { describe, expect, it } from 'vitest'
import { isRedoShortcut, isUndoShortcut } from '../../../src/ui/lib/undo-keyboard'

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return init as KeyboardEvent
}

describe('undo keyboard shortcuts', () => {
  it('detects Ctrl/Cmd+Z as undo', () => {
    expect(isUndoShortcut(keyEvent({ key: 'z', ctrlKey: true }))).toBe(true)
    expect(isUndoShortcut(keyEvent({ key: 'Z', metaKey: true }))).toBe(true)
    expect(isUndoShortcut(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('detects redo shortcuts', () => {
    expect(isRedoShortcut(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isRedoShortcut(keyEvent({ key: 'Z', metaKey: true, shiftKey: true }))).toBe(true)
    expect(isRedoShortcut(keyEvent({ key: 'y', ctrlKey: true }))).toBe(true)
    expect(isRedoShortcut(keyEvent({ key: 'y', metaKey: true }))).toBe(false)
  })
})
