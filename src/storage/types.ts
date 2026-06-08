import type { DrawElement, ServiceOptions } from '../core'

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
  accentMode: 'red' | 'yellow'
  previewDitherMode: 0 | 2
}

/** Single last-edited design row in IndexedDB (ADR-003). */
export interface SessionSnapshot {
  id: typeof SESSION_ROW_ID
  name: string
  canvas: SessionCanvas
  service?: ServiceOptions
  elements: DrawElement[]
  updatedAt: number
}

export const SESSION_ROW_ID = 'current' as const
