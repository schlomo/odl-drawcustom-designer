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
  /**
   * Per-entity attribute map backing `state_attr` / `is_state_attr` / dotted
   * access (issue #4). Values are TYPED JSON (boolean/number/null/array/object/
   * string) and round-trip via IndexedDB structured clone — no stringification,
   * so no schema/version change is needed for typed attribute values.
   */
  attributes?: Record<string, unknown>
}

/**
 * Global user-defined template variable row — one map per browser (ADR-003).
 * The designer's analog of HA script-level `variables:`; injected into every
 * field's template evaluation (ADR-004).
 */
export interface StoredVariable {
  name: string
  value: string
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
