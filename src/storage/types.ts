/** IndexedDB row: exact YAML path → blob + mime (ADR-002, ADR-003). */
export interface StoredAsset {
  key: string
  blob: Blob
  mime: string
  updatedAt: number
}

/** Per-project HA mock state row. */
export interface StoredMock {
  projectId: string
  entityId: string
  value: string | number | boolean
}

/** Minimal project snapshot — expanded in Phase 4 history (ADR-003). */
export interface ProjectSnapshot {
  id: string
  name: string
  updatedAt: number
  elementCount?: number
  canvas?: {
    width: number
    height: number
    rotation: number
  }
}
