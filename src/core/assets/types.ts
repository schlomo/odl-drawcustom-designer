import type { Payload } from '../schema/payload'

export type AssetKind = 'font' | 'image'

export interface AssetReference {
  /** JSON-path-like location within the payload, e.g. `[0].font`. */
  path: string
  /** Exact string from YAML — used as the content-map key. */
  key: string
  kind: AssetKind
}

export interface AssetScanResult {
  references: AssetReference[]
  /** Unique asset keys referenced in the payload, sorted. */
  keys: string[]
}

export interface AssetEntry {
  blob: Blob
  mime: string
}

export type AssetResolutionStatus = 'resolved' | 'bundled' | 'missing'

export interface AssetResolution {
  key: string
  status: AssetResolutionStatus
  blob?: Blob
  mime?: string
}

export type { Payload }
