import { BUNDLED_SHOWCASE_IMAGE_KEY, isImageMime, resolveAsset, type DrawElement } from '../../core'
import { shouldUseBundledShowcaseImage } from '../preferences/showcaseAsset'
import { bundledImageUrl } from './bundled-image-url'

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to decode image from ${src}`))
    image.src = src
  })
}

async function loadBundledImage(key: string): Promise<HTMLImageElement | null> {
  if (!shouldUseBundledShowcaseImage(key, BUNDLED_SHOWCASE_IMAGE_KEY)) {
    return null
  }

  const url = bundledImageUrl(key)
  if (!url) {
    return null
  }

  try {
    return await loadImageElement(url)
  } catch {
    return null
  }
}

/** Load decoded images for content-map keys referenced by dlimg elements. */
export async function loadAssetImageMap(keys: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>()
  const uniqueKeys = [...new Set(keys)]

  for (const key of uniqueKeys) {
    const resolution = resolveAsset(key)
    if (resolution.blob && resolution.mime && isImageMime(resolution.mime)) {
      const objectUrl = URL.createObjectURL(resolution.blob)
      try {
        const image = await loadImageElement(objectUrl)
        images.set(key, image)
      } catch {
        // Fall back to placeholder drawing for this key.
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
      continue
    }

    const bundledImage = await loadBundledImage(key)
    if (bundledImage) {
      images.set(key, bundledImage)
    }
  }

  return images
}

export function collectDlimgAssetKeysFromElements(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()

  for (const element of elements) {
    if (element.type === 'dlimg' && element.url) {
      keys.add(element.url)
    }
  }

  return [...keys].sort()
}

export function areAssetImageMapsEqual(
  left: ReadonlyMap<string, HTMLImageElement>,
  right: ReadonlyMap<string, HTMLImageElement>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, image] of left) {
    if (right.get(key) !== image) {
      return false
    }
  }

  return true
}

export function pruneAssetImagesForKeys(
  current: ReadonlyMap<string, HTMLImageElement>,
  keys: readonly string[],
): Map<string, HTMLImageElement> {
  const next = new Map<string, HTMLImageElement>()

  for (const key of keys) {
    const resolution = resolveAsset(key)
    if (resolution.status === 'resolved' && current.has(key)) {
      next.set(key, current.get(key)!)
      continue
    }
    if (shouldUseBundledShowcaseImage(key, BUNDLED_SHOWCASE_IMAGE_KEY) && current.has(key)) {
      next.set(key, current.get(key)!)
    }
  }

  return next
}

export function collectDlimgAssetKeys(
  primitives: readonly { kind: string; url?: string }[],
): string[] {
  const keys = new Set<string>()

  for (const primitive of primitives) {
    if (primitive.kind === 'dlimg-stub' && primitive.url) {
      keys.add(primitive.url)
    }
  }

  return [...keys].sort()
}
