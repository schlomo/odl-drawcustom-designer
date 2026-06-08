import {
  deleteAsset,
  loadAssetsIntoContentMap,
  setAsset,
  type AssetEntry,
} from '../core/assets'
import { db, ensureDbReady } from './db'
import type { StoredAsset } from './types'

export async function listStoredAssets(): Promise<StoredAsset[]> {
  await ensureDbReady()
  return db.assets.toArray()
}

export async function getStoredAsset(key: string): Promise<StoredAsset | undefined> {
  await ensureDbReady()
  return db.assets.get(key)
}

export async function putStoredAsset(key: string, entry: AssetEntry): Promise<void> {
  await ensureDbReady()
  const row: StoredAsset = {
    key,
    blob: entry.blob,
    mime: entry.mime,
    updatedAt: Date.now(),
  }
  await db.assets.put(row)
}

export async function deleteStoredAsset(key: string): Promise<void> {
  await ensureDbReady()
  await db.assets.delete(key)
}

/** Load all IndexedDB assets into the in-memory content map (sync resolver). */
export async function hydrateContentMapFromStorage(): Promise<void> {
  const assets = await listStoredAssets()
  loadAssetsIntoContentMap(
    assets.map(({ key, blob, mime }) => ({
      key,
      entry: { blob, mime },
    })),
  )
}

/** Persist to IndexedDB and update the in-memory content map. */
export async function persistAsset(key: string, entry: AssetEntry): Promise<void> {
  await putStoredAsset(key, entry)
  setAsset(key, entry)
}

/** Remove from IndexedDB and the in-memory content map. */
export async function removePersistedAsset(key: string): Promise<void> {
  await deleteStoredAsset(key)
  deleteAsset(key)
}
