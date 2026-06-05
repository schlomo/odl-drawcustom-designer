import { BUNDLED_FONT_KEYS, resolveAsset } from '../../core'
import type { DrawElement } from '../../core/schema/elements'
import { hasTemplateSyntax } from '../../core/templates/patterns'

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)

export function fontFamilyNameForKey(key: string): string {
  const slug = key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `oepl-font-${slug || 'default'}`
}

function bundledFontUrl(key: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}fonts/${encodeURIComponent(key)}`
}

export function collectFontKeysFromElements(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()

  for (const element of elements) {
    if ('font' in element && typeof element.font === 'string' && element.font) {
      if (!hasTemplateSyntax(element.font)) {
        keys.add(element.font)
      }
    }
  }

  return [...keys].sort()
}

export async function loadFontFamilyMap(keys: readonly string[]): Promise<Map<string, string>> {
  const families = new Map<string, string>()
  const uniqueKeys = [...new Set(keys)]

  for (const key of uniqueKeys) {
    const family = fontFamilyNameForKey(key)
    const resolution = resolveAsset(key)

    try {
      if (resolution.status === 'resolved' && resolution.blob) {
        const face = new FontFace(family, resolution.blob)
        await face.load()
        document.fonts.add(face)
        families.set(key, family)
        continue
      }

      if (resolution.status === 'bundled' || bundledFontKeys.has(key)) {
        const face = new FontFace(family, `url(${bundledFontUrl(key)})`)
        await face.load()
        document.fonts.add(face)
        families.set(key, family)
      }
    } catch {
      // Keep sans-serif fallback for this key.
    }
  }

  return families
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
