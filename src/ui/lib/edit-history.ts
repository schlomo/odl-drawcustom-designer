import type { DrawElement, ServiceOptions } from '../../core'
import type { DisplayConfig } from '../preferences/displayConfig'

export const EDIT_HISTORY_MAX = 50

export interface EditSnapshot {
  elements: DrawElement[]
  canvas: DisplayConfig
  service: ServiceOptions | undefined
  selectedIndices: number[]
}

export function cloneEditSnapshot(snapshot: EditSnapshot): EditSnapshot {
  return {
    elements: structuredClone(snapshot.elements),
    canvas: { ...snapshot.canvas },
    service: snapshot.service ? { ...snapshot.service } : undefined,
    selectedIndices: [...snapshot.selectedIndices],
  }
}

export function snapshotsEqual(left: EditSnapshot, right: EditSnapshot): boolean {
  return (
    left.selectedIndices.length === right.selectedIndices.length &&
    left.selectedIndices.every((index, offset) => index === right.selectedIndices[offset]) &&
    left.canvas.width === right.canvas.width &&
    left.canvas.height === right.canvas.height &&
    left.canvas.rotation === right.canvas.rotation &&
    left.canvas.accentMode === right.canvas.accentMode &&
    left.canvas.previewDitherMode === right.canvas.previewDitherMode &&
    JSON.stringify(left.service) === JSON.stringify(right.service) &&
    JSON.stringify(left.elements) === JSON.stringify(right.elements)
  )
}

export class EditHistory {
  private undoStack: EditSnapshot[] = []
  private redoStack: EditSnapshot[] = []
  private coalescing = false
  private coalesceBefore: EditSnapshot | null = null

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoDepth(): number {
    return this.undoStack.length
  }

  get redoDepth(): number {
    return this.redoStack.length
  }

  isCoalescing(): boolean {
    return this.coalescing
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.coalescing = false
    this.coalesceBefore = null
  }

  /** Record state before a discrete mutation. Clears redo. */
  recordBefore(snapshot: EditSnapshot): void {
    if (this.coalescing) {
      return
    }
    const cloned = cloneEditSnapshot(snapshot)
    const previous = this.undoStack[this.undoStack.length - 1]
    if (previous && snapshotsEqual(previous, cloned)) {
      return
    }
    this.redoStack = []
    this.undoStack.push(cloned)
    while (this.undoStack.length > EDIT_HISTORY_MAX) {
      this.undoStack.shift()
    }
  }

  beginCoalesce(before: EditSnapshot): void {
    this.coalescing = true
    this.coalesceBefore = cloneEditSnapshot(before)
  }

  endCoalesce(after: EditSnapshot): void {
    if (!this.coalescing) {
      return
    }
    this.coalescing = false
    const before = this.coalesceBefore
    this.coalesceBefore = null
    if (!before || snapshotsEqual(before, after)) {
      return
    }
    this.redoStack = []
    this.undoStack.push(before)
    while (this.undoStack.length > EDIT_HISTORY_MAX) {
      this.undoStack.shift()
    }
  }

  cancelCoalesce(): void {
    this.coalescing = false
    this.coalesceBefore = null
  }

  exportStacks(): { undoStack: EditSnapshot[]; redoStack: EditSnapshot[] } {
    return {
      undoStack: this.undoStack.map(cloneEditSnapshot),
      redoStack: this.redoStack.map(cloneEditSnapshot),
    }
  }

  loadStacks(stacks: { undoStack: EditSnapshot[]; redoStack: EditSnapshot[] }): void {
    this.clear()
    const trim = (stack: EditSnapshot[]) => {
      const copy = stack.map(cloneEditSnapshot)
      while (copy.length > EDIT_HISTORY_MAX) {
        copy.shift()
      }
      return copy
    }
    this.undoStack = trim(stacks.undoStack)
    this.redoStack = trim(stacks.redoStack)
  }

  undo(current: EditSnapshot): EditSnapshot | null {
    if (this.undoStack.length === 0) {
      return null
    }
    const previous = this.undoStack.pop()!
    this.redoStack.push(cloneEditSnapshot(current))
    return previous
  }

  redo(current: EditSnapshot): EditSnapshot | null {
    if (this.redoStack.length === 0) {
      return null
    }
    const next = this.redoStack.pop()!
    this.undoStack.push(cloneEditSnapshot(current))
    return next
  }
}
