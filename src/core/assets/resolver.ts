import type { AssetEntry, AssetResolution } from './types'

/** Bundled fonts shipped under `public/fonts/` — resolved without upload. */
export const BUNDLED_FONT_KEYS = ['ppb.ttf', 'rbm.ttf'] as const

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)

let contentMap = new Map<string, AssetEntry>()

export function setAsset(key: string, entry: AssetEntry): void {
  contentMap.set(key, entry)
}

export function deleteAsset(key: string): void {
  contentMap.delete(key)
}

export function resetContentMap(): void {
  contentMap = new Map()
}

export function resolveAsset(key: string): AssetResolution {
  const entry = contentMap.get(key)
  if (entry) {
    return {
      key,
      status: 'resolved',
      blob: entry.blob,
      mime: entry.mime,
    }
  }

  if (bundledFontKeys.has(key)) {
    return { key, status: 'bundled' }
  }

  return { key, status: 'missing' }
}
