import {
  BUNDLED_FONT_KEYS,
  collectRequiredFontKeys,
  fontFamilyNameForKey,
  hasHostAssetResolver,
  hasHostSuppliedAsset,
  isSupportedFontKey,
  registerHostAssetEvictor,
  resolveAsset,
  resolveHostAsset,
  type DrawElement,
} from '../../core'
import { bundledFontUrl } from './font-url'

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)
const fontFamilyCache = new Map<string, string>()
/**
 * The `FontFace` objects this module added to `document.fonts` for
 * **host-supplied** fonts, so disposing the mount that supplied them can take
 * them back off the host page's document (issue #138). Locally uploaded and
 * bundled faces are deliberately not tracked: they pre-date this tier and stay
 * for the document's lifetime as they always have.
 */
const hostFontFaces = new Map<string, FontFace>()

export { fontFamilyNameForKey }

export function collectFontKeysFromElements(elements: readonly DrawElement[]): string[] {
  return collectRequiredFontKeys(elements)
}

function isFontKeyAvailable(key: string): boolean {
  const resolution = resolveAsset(key)
  return (
    resolution.status === 'resolved' ||
    resolution.status === 'bundled' ||
    bundledFontKeys.has(key) ||
    hasHostSuppliedAsset('font', key)
  )
}

function evictStaleFontFamilyEntries(keys: readonly string[]): void {
  for (const key of keys) {
    if (fontFamilyCache.has(key) && !isFontKeyAvailable(key)) {
      fontFamilyCache.delete(key)
    }
  }
}

/**
 * When the mount that supplied a font goes away, so must its CSS face: the
 * family map and `document.fonts` both outlive any one mount, and a stale
 * entry would let canvas text keep painting a font nothing can supply — or, on
 * a page with two hosts, the wrong host's font for the same name.
 */
registerHostAssetEvictor((kind, name) => {
  if (kind !== 'font') {
    return
  }
  fontFamilyCache.delete(name)
  const face = hostFontFaces.get(name)
  if (face) {
    hostFontFaces.delete(name)
    document.fonts.delete(face)
  }
})

/**
 * Register one host-supplied font as a CSS face. The bytes are always handed
 * over as an `ArrayBuffer`, including for a URL answer: a URL goes into a CSS
 * `src` descriptor otherwise, and a host media route is free to hand back
 * `logo (1).ttf` or a query string with parentheses — which no amount of
 * interpolation makes a parseable `url()`. Fetching first also keeps the two
 * host answer shapes on one code path.
 */
async function addHostFontFace(key: string, family: string): Promise<void> {
  const supplied = await resolveHostAsset('font', key)

  let bytes: ArrayBuffer
  if (supplied.status === 'blob') {
    bytes = await supplied.blob.arrayBuffer()
  } else if (supplied.status === 'url') {
    const response = await fetch(supplied.url)
    if (!response.ok) {
      return
    }
    bytes = await response.arrayBuffer()
  } else {
    // Nothing to add. A host that cannot supply the font needs no handling
    // here: the opentype loader (load-opentype-fonts.ts) is what turns that
    // into the visible render-error state, and this map only ever adds a
    // family.
    return
  }

  const face = new FontFace(family, bytes)
  await face.load()
  document.fonts.add(face)
  hostFontFaces.set(key, face)
  fontFamilyCache.set(key, family)
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
          return
        }

        // Last tier (issue #138): a font the payload names but the designer has
        // never seen — the host supplies it, and canvas text gets the same CSS
        // family a locally uploaded font would get.
        if (hasHostAssetResolver()) {
          await addHostFontFace(key, family)
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
  hostFontFaces.clear()
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
