import { isSupportedFontKey } from './mime'
import { BUNDLED_FONT_KEYS, listContentMapKeys, resolveAsset } from './resolver'

function isFontAssetKey(key: string): boolean {
  if (BUNDLED_FONT_KEYS.includes(key as (typeof BUNDLED_FONT_KEYS)[number])) {
    return true
  }
  return resolveAsset(key).status === 'resolved' && isSupportedFontKey(key)
}

/** Bundled fonts plus every font uploaded to the local content map. */
export function listLibraryFontKeys(): string[] {
  const keys = new Set<string>(BUNDLED_FONT_KEYS)

  for (const key of listContentMapKeys()) {
    if (isFontAssetKey(key)) {
      keys.add(key)
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b))
}
