import type { AssetEntry, AssetResolution } from './types'

/** Bundled fonts shipped under `src/assets/fonts/` — resolved without upload. */
export const BUNDLED_FONT_KEYS = ['ppb.ttf', 'rbm.ttf'] as const

/** Bundled demo image for the showcase dashboard dlimg element. */
export const BUNDLED_SHOWCASE_IMAGE_KEY = '/local/showcase.png' as const

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)
const bundledImageKeys = new Set<string>([BUNDLED_SHOWCASE_IMAGE_KEY])

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

/** Replace the in-memory map — used when hydrating from IndexedDB. */
export function loadAssetsIntoContentMap(
  entries: ReadonlyArray<{ key: string; entry: AssetEntry }>,
): void {
  contentMap = new Map(entries.map(({ key, entry }) => [key, entry]))
}

export function listContentMapKeys(): string[] {
  return [...contentMap.keys()].sort((a, b) => a.localeCompare(b))
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

  if (bundledImageKeys.has(key)) {
    return { key, status: 'bundled' }
  }

  return { key, status: 'missing' }
}
