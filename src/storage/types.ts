import type { DrawElement, ServiceOptions } from '../core'
import type { TagColorMode } from '../core/display/palette'

/** IndexedDB row: exact YAML path → blob + mime (ADR-002, ADR-003). */
export interface StoredAsset {
  key: string
  blob: Blob
  mime: string
  updatedAt: number
}

/** Global HA mock state row — one map per browser (ADR-003). */
export interface StoredMock {
  entityId: string
  value: string | number | boolean
}

export interface SessionCanvas {
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  colorMode: TagColorMode
  previewDitherMode: 0 | 2
}

/** One undo/redo history entry — mirrors the in-memory edit snapshot. */
export interface SessionEditSnapshot {
  elements: DrawElement[]
  canvas: SessionCanvas
  service?: ServiceOptions
  selectedIndices: number[]
}

/** Persisted undo/redo stacks (max 50 entries each at save time). */
export interface PersistedEditHistory {
  undoStack: SessionEditSnapshot[]
  redoStack: SessionEditSnapshot[]
}

/** Single last-edited design row in IndexedDB (ADR-003). */
export interface SessionSnapshot {
  id: typeof SESSION_ROW_ID
  name: string
  canvas: SessionCanvas
  service?: ServiceOptions
  elements: DrawElement[]
  editHistory?: PersistedEditHistory
  updatedAt: number
}

export const SESSION_ROW_ID = 'current' as const
