import {
  clearImageUnavailable,
  dataUrlMediaType,
  hasHostAssetResolver,
  hasHostSuppliedAsset,
  isDataUrl,
  isImageMime,
  isRenderableImageDataUrl,
  markImageUnavailable,
  resolveAsset,
  resolveHostAsset,
  type DrawElement,
} from '../../core'
import type { ImageLoadBatchResult, ImageLoadOutcome } from './image-load-outcome'

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to decode image from ${src}`))
    image.src = src
  })
}

/**
 * How a failed `data:` image is named in messages. The URL *is* the image, so
 * naming it would paste kilobytes of base64 into a banner, and its first
 * characters are the same PNG signature for every image — the media type and
 * length are what tell one inline image from another.
 */
function dataUrlLabel(key: string): string {
  return `data: ${dataUrlMediaType(key) || 'image'} (${key.length} chars)`
}

/** Mirrors load-opentype-fonts.ts's isFontAssetAvailable: does the content
 * map know about this key at all — independent of whether it has actually
 * been decoded successfully yet. */
function isImageAssetAvailable(key: string): boolean {
  // A `data:` URL carries the image itself — nothing can be "not uploaded".
  if (isDataUrl(key)) {
    return true
  }
  const resolution = resolveAsset(key)
  if (resolution.status === 'resolved') {
    return isImageMime(resolution.mime ?? '')
  }
  // A host-supplied image (issue #138) is as available as an uploaded one —
  // the host resolver is the last tier behind the content map, not a
  // different kind of asset.
  return hasHostSuppliedAsset('image', key)
}

interface ImageLoadAttempt {
  outcome: ImageLoadOutcome
  image?: HTMLImageElement
}

/** Never stale — the default when a caller doesn't need generation-tokening (e.g. tests, one-off calls). */
function neverStale(): boolean {
  return false
}

function readyAttempt(key: string, image: HTMLImageElement, isStale: () => boolean): ImageLoadAttempt {
  // An image that just became ready is, by definition, no longer confirmed
  // unavailable — clear any stale mark from a previous failed attempt so
  // renderDlimg (core) stops treating it as an error. Skipped if THIS batch
  // has itself been superseded (see `isStale` doc below) — a superseded
  // batch's determination, even a correct one, must not overwrite whatever
  // the newer, current batch already decided.
  if (!isStale()) {
    clearImageUnavailable(key)
  }
  return { outcome: { key, status: 'ready' }, image }
}

/**
 * Every non-ready outcome below is a confirmed, settled failure (not a
 * transient "still loading" state) — mark it unavailable in the core image
 * registry so renderDlimg switches from silently doing nothing to the
 * explicit render-error placeholder (issue #55, mirroring #53's font fix).
 * Skipped if stale — see `readyAttempt`.
 */
function unavailableAttempt(
  key: string,
  status: 'missing' | 'failed',
  message: string,
  isStale: () => boolean,
): ImageLoadAttempt {
  if (!isStale()) {
    markImageUnavailable(key, message)
  }
  return { outcome: { key, status, message } }
}

/** The local-only message, unchanged from before the host tier existed. */
function missingImageMessage(key: string): string {
  return `${key} is not uploaded — add it in Content Manager.`
}

/**
 * A `data:` URL is self-contained: hand it to the decoder as-is. It consults
 * neither the content map nor the host — and awaits nothing host-related, so
 * the standalone "no resolver, pre-tier path" invariant holds for it trivially.
 *
 * Gated to what the real send can render first (`isRenderableImageDataUrl`):
 * a browser previews SVG or a non-base64 payload that odl-renderer rejects,
 * which would be exactly the "previews here, fails on the display" gap.
 * Neither message carries the URL itself — the decoder's error names the
 * full `src`, so it is deliberately not echoed as a detail here.
 */
async function loadDataUrlImage(key: string, isStale: () => boolean): Promise<ImageLoadAttempt> {
  if (!isRenderableImageDataUrl(key)) {
    return unavailableAttempt(
      key,
      'failed',
      `${dataUrlLabel(key)} cannot be sent — Home Assistant renders only base64-encoded raster data: URLs (png, jpeg, gif, bmp, webp).`,
      isStale,
    )
  }
  try {
    return readyAttempt(key, await loadImageElement(key), isStale)
  } catch {
    return unavailableAttempt(
      key,
      'failed',
      `${dataUrlLabel(key)} could not be decoded — the inline image data is not a valid image.`,
      isStale,
    )
  }
}

/**
 * Ask the host for an image the designer could not resolve locally (issue #138,
 * the last tier). A blob is decoded through an object URL exactly as an
 * uploaded asset is; a URL answer is handed to the decoder as-is. Anything the
 * host cannot supply settles as a confirmed failure, so `renderDlimg` shows the
 * explicit render-error placeholder naming the asset instead of a silent gap.
 */
async function loadHostImage(key: string, isStale: () => boolean): Promise<ImageLoadAttempt> {
  const supplied = await resolveHostAsset('image', key)

  if (supplied.status === 'blob') {
    const objectUrl = URL.createObjectURL(supplied.blob)
    try {
      return readyAttempt(key, await loadImageElement(objectUrl), isStale)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return unavailableAttempt(key, 'failed', `${key} could not be decoded (${detail}).`, isStale)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  if (supplied.status === 'url') {
    try {
      return readyAttempt(key, await loadImageElement(supplied.url), isStale)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return unavailableAttempt(
        key,
        'failed',
        `${key} could not be loaded from the host (${detail}).`,
        isStale,
      )
    }
  }

  if (supplied.status === 'failed') {
    return unavailableAttempt(
      key,
      'failed',
      `${key} could not be supplied by the host (${supplied.message}).`,
      isStale,
    )
  }

  if (supplied.status === 'declined') {
    return unavailableAttempt(
      key,
      'missing',
      `${key} could not be supplied by the host — add it in Content Manager.`,
      isStale,
    )
  }

  // 'absent': the mount was destroyed while this load was in flight, so there
  // is no host to blame — report the local-only message.
  return unavailableAttempt(key, 'missing', missingImageMessage(key), isStale)
}

/**
 * `isStale`: independent review finding on PR #58 — DesignerCanvas's loading
 * effect only gated its own `setState` calls on whether it had been
 * superseded (its `cancelled` flag); that flag never reached this loader, so
 * an OLD (superseded) batch's in-flight registry writes could still land
 * AFTER a NEWER batch had already written its own, correct determination for
 * the same key — a stale write silently clobbering a fresh one (reachable
 * via rapid element edits that change which dlimg URLs are in flight).
 * Callers that care (DesignerCanvas) pass their own staleness flag (the same
 * `cancelled` ref/closure already used for `setState`); one-off callers
 * (tests, `loadAssetImageMap`) default to `neverStale`.
 */
async function loadAssetImage(key: string, isStale: () => boolean): Promise<ImageLoadAttempt> {
  // Clear a stale "confirmed unavailable" mark from a previous failed
  // attempt as soon as we know the asset now resolves — before any `await`
  // below. Mirrors the font fix (PR #54, Copilot review 3610491466):
  // without this, an image that was missing and then got uploaded would
  // keep showing the render-error placeholder for the entire decode window
  // of the retry. A still-missing key is a no-op here — its mark stays.
  if (isImageAssetAvailable(key) && !isStale()) {
    clearImageUnavailable(key)
  }

  if (isDataUrl(key)) {
    return loadDataUrlImage(key, isStale)
  }

  // `isImageAssetAvailable` (above) and this `resolveAsset` are two separate
  // calls into the same synchronous, in-memory content-map read — reviewed
  // on PR #58 as a possible TOCTOU race (map mutates between the two).
  // Refuted: there is no `await` between them, and JS is single-threaded, so
  // nothing can mutate the content map in the gap; both calls necessarily
  // observe the same snapshot. More importantly, this snapshot is only ever
  // used to pick a branch below — every branch unconditionally settles a
  // definitive `readyAttempt`/`unavailableAttempt` outcome by
  // the time this function returns, so even a hypothetical future reordering
  // that separated these two reads with a real await could only ever delay
  // which (still self-consistent) branch runs, never leave the mark cleared
  // above without a matching, corrective settle below.
  const resolution = resolveAsset(key)

  if (resolution.status === 'resolved') {
    if (!resolution.blob || !isImageMime(resolution.mime ?? '')) {
      return unavailableAttempt(
        key,
        'failed',
        `${key} is not a supported image type (mime: ${resolution.mime ?? 'unknown'}).`,
        isStale,
      )
    }

    const objectUrl = URL.createObjectURL(resolution.blob)
    try {
      const image = await loadImageElement(objectUrl)
      return readyAttempt(key, image, isStale)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return unavailableAttempt(key, 'failed', `${key} could not be decoded (${detail}).`, isStale)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // Only fonts have a bundled tier; an image key never resolves as 'bundled'
  // (the Load Demo carries its picture inline as a `data:` URL instead).
  if (hasHostAssetResolver()) {
    return loadHostImage(key, isStale)
  }

  return unavailableAttempt(key, 'missing', missingImageMessage(key), isStale)
}

export async function loadAssetImageMapWithOutcomes(
  keys: readonly string[],
  isStale: () => boolean = neverStale,
): Promise<ImageLoadBatchResult> {
  const images = new Map<string, HTMLImageElement>()
  const outcomes = new Map<string, ImageLoadOutcome>()
  const uniqueKeys = [...new Set(keys)]

  await Promise.all(
    uniqueKeys.map(async (key) => {
      const attempt = await loadAssetImage(key, isStale)
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
    if (!current.has(key)) {
      continue
    }
    // A `data:` image and a host-supplied image (issue #138) have no
    // content-map entry to prove they resolve — without this they would be
    // pruned out of the render map on the next repaint and the canvas would
    // lose an image it just loaded.
    if (
      isDataUrl(key) ||
      resolveAsset(key).status === 'resolved' ||
      hasHostSuppliedAsset('image', key)
    ) {
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
