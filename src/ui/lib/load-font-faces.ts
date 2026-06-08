import { BUNDLED_FONT_KEYS, collectRequiredFontKeys, fontFamilyNameForKey, isSupportedFontKey, resolveAsset, type DrawElement } from '../../core'
import { bundledFontUrl } from './font-url'

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)
const fontFamilyCache = new Map<string, string>()

export { fontFamilyNameForKey }

export function collectFontKeysFromElements(elements: readonly DrawElement[]): string[] {
  return collectRequiredFontKeys(elements)
}

function isFontKeyAvailable(key: string): boolean {
  const resolution = resolveAsset(key)
  return resolution.status === 'resolved' || resolution.status === 'bundled' || bundledFontKeys.has(key)
}

function evictStaleFontFamilyEntries(keys: readonly string[]): void {
  for (const key of keys) {
    if (fontFamilyCache.has(key) && !isFontKeyAvailable(key)) {
      fontFamilyCache.delete(key)
    }
  }
}

export async function loadFontFamilyMap(keys: readonly string[]): Promise<Map<string, string>> {
  const uniqueKeys = [...new Set(keys)]
  evictStaleFontFamilyEntries(uniqueKeys)
  const pendingKeys = uniqueKeys.filter((key) => !fontFamilyCache.has(key))

  await Promise.all(
    pendingKeys.map(async (key) => {
      if (!isSupportedFontKey(key) && !bundledFontKeys.has(key)) {
        return
      }

      const family = fontFamilyNameForKey(key)
      const resolution = resolveAsset(key)

      try {
        if (resolution.status === 'resolved' && resolution.blob) {
          const face = new FontFace(family, await resolution.blob.arrayBuffer())
          await face.load()
          document.fonts.add(face)
          fontFamilyCache.set(key, family)
          return
        }

        if (resolution.status === 'bundled' || bundledFontKeys.has(key)) {
          const face = new FontFace(family, `url(${bundledFontUrl(key)})`)
          await face.load()
          document.fonts.add(face)
          fontFamilyCache.set(key, family)
        }
      } catch {
        // Keep sans-serif fallback for this key.
      }
    }),
  )

  const families = new Map<string, string>()
  for (const key of uniqueKeys) {
    const family = fontFamilyCache.get(key)
    if (family) {
      families.set(key, family)
    }
  }

  return families
}

export function clearFontFamilyCacheForTests(): void {
  fontFamilyCache.clear()
}

export function resolveCanvasFontFamily(
  fontKey: string | undefined,
  fontFamilies: ReadonlyMap<string, string>,
): string {
  if (!fontKey) {
    return 'sans-serif'
  }
  return fontFamilies.get(fontKey) ?? 'sans-serif'
}

export function areFontFamilyMapsEqual(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, family] of left) {
    if (right.get(key) !== family) {
      return false
    }
  }

  return true
}
