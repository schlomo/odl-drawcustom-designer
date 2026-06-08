import { resolveAsset, isImageMime, type DrawElement } from '../../core'

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to decode image from ${objectUrl}`))
    image.src = objectUrl
  })
}

/** Load decoded images for content-map keys referenced by dlimg elements. */
export async function loadAssetImageMap(keys: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>()
  const uniqueKeys = [...new Set(keys)]

  for (const key of uniqueKeys) {
    const resolution = resolveAsset(key)
    if (!resolution.blob || !resolution.mime || !isImageMime(resolution.mime)) {
      continue
    }

    const objectUrl = URL.createObjectURL(resolution.blob)
    try {
      const image = await loadImageElement(objectUrl)
      images.set(key, image)
    } catch {
      // Fall back to placeholder drawing for this key.
    } finally {
      URL.revokeObjectURL(objectUrl)
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
