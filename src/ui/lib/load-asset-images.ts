import {
  BUNDLED_SHOWCASE_IMAGE_KEY,
  clearImageUnavailable,
  isImageMime,
  markImageUnavailable,
  resolveAsset,
  type DrawElement,
} from '../../core'
import { shouldUseBundledShowcaseImage } from '../preferences/showcaseAsset'
import { bundledImageUrl } from './bundled-image-url'
import type { ImageLoadBatchResult, ImageLoadOutcome } from './image-load-outcome'

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to decode image from ${src}`))
    image.src = src
  })
}

/** Mirrors load-opentype-fonts.ts's isFontAssetAvailable: does the content
 * map (or the bundled-asset set) know about this key at all — independent of
 * whether it has actually been decoded successfully yet. */
function isImageAssetAvailable(key: string): boolean {
  const resolution = resolveAsset(key)
  if (resolution.status === 'resolved') {
    return isImageMime(resolution.mime ?? '')
  }
  return resolution.status === 'bundled'
}

interface ImageLoadAttempt {
  outcome: ImageLoadOutcome
  image?: HTMLImageElement
}

function readyAttempt(key: string, image: HTMLImageElement): ImageLoadAttempt {
  // An image that just became ready is, by definition, no longer confirmed
  // unavailable — clear any stale mark from a previous failed attempt so
  // renderDlimg (core) stops treating it as an error.
  clearImageUnavailable(key)
  return { outcome: { key, status: 'ready' }, image }
}

/**
 * Every non-ready outcome below is a confirmed, settled failure (not a
 * transient "still loading" state) — mark it unavailable in the core image
 * registry so renderDlimg switches from silently doing nothing to the
 * explicit render-error placeholder (issue #55, mirroring #53's font fix).
 */
function unavailableAttempt(
  key: string,
  status: 'missing' | 'failed',
  message: string,
): ImageLoadAttempt {
  markImageUnavailable(key, message)
  return { outcome: { key, status, message } }
}

async function loadAssetImage(key: string): Promise<ImageLoadAttempt> {
  // Clear a stale "confirmed unavailable" mark from a previous failed
  // attempt as soon as we know the asset now resolves — before any `await`
  // below. Mirrors the font fix (PR #54, Copilot review 3610491466):
  // without this, an image that was missing and then got uploaded would
  // keep showing the render-error placeholder for the entire decode window
  // of the retry. A still-missing key is a no-op here — its mark stays.
  if (isImageAssetAvailable(key)) {
    clearImageUnavailable(key)
  }

  const resolution = resolveAsset(key)

  if (resolution.status === 'resolved') {
    if (!resolution.blob || !isImageMime(resolution.mime ?? '')) {
      return unavailableAttempt(
        key,
        'failed',
        `${key} is not a supported image type (mime: ${resolution.mime ?? 'unknown'}).`,
      )
    }

    const objectUrl = URL.createObjectURL(resolution.blob)
    try {
      const image = await loadImageElement(objectUrl)
      return readyAttempt(key, image)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return unavailableAttempt(key, 'failed', `${key} could not be decoded (${detail}).`)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  if (resolution.status === 'bundled') {
    if (!shouldUseBundledShowcaseImage(key, BUNDLED_SHOWCASE_IMAGE_KEY)) {
      // Deliberately dismissed by the user — not an error, never mark
      // unavailable, never show a render-error marker or banner for it.
      return { outcome: { key, status: 'suppressed' } }
    }

    const url = bundledImageUrl(key)
    if (!url) {
      return unavailableAttempt(key, 'failed', `${key} has no bundled asset URL.`)
    }

    try {
      const image = await loadImageElement(url)
      return readyAttempt(key, image)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return unavailableAttempt(key, 'failed', `${key} could not be loaded (${detail}).`)
    }
  }

  return unavailableAttempt(key, 'missing', `${key} is not uploaded — add it in Content Manager.`)
}

export async function loadAssetImageMapWithOutcomes(
  keys: readonly string[],
): Promise<ImageLoadBatchResult> {
  const images = new Map<string, HTMLImageElement>()
  const outcomes = new Map<string, ImageLoadOutcome>()
  const uniqueKeys = [...new Set(keys)]

  await Promise.all(
    uniqueKeys.map(async (key) => {
      const attempt = await loadAssetImage(key)
      outcomes.set(key, attempt.outcome)
      if (attempt.image) {
        images.set(key, attempt.image)
      }
    }),
  )

  return { images, outcomes }
}

/** Load decoded images for content-map keys referenced by dlimg elements. */
export async function loadAssetImageMap(keys: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  const result = await loadAssetImageMapWithOutcomes(keys)
  return result.images
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
