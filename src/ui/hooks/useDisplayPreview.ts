import { useCallback, useEffect, useRef, useState } from 'react'
import type { DitherMode } from '../../core'
import type { HostPreviewRenderer } from '../../embed/types'

/**
 * Payload edits collapse into one host render request (issue #109): a host
 * render is a round trip to real hardware or a real rasterizer, so it must not
 * fire per keystroke. Long enough to swallow typing, short enough that the
 * preview visibly follows the design.
 */
export const DISPLAY_PREVIEW_DEBOUNCE_MS = 250

/** Shown when the provider rejects without a message of its own. */
export const DISPLAY_PREVIEW_FAILED_MESSAGE = 'The host could not render this preview'

/** Copy/Download PNG while the first host render is still in flight. */
export const DISPLAY_PREVIEW_NOT_READY_MESSAGE = 'Display preview is still rendering'

/** Shown when a provider resolves with something that is not an image. */
export const DISPLAY_PREVIEW_NO_IMAGE_MESSAGE = 'The host returned no preview image'

/**
 * The Display preview seam as the designer chrome sees it (issue #109,
 * ADR-018 preview provider). `available` is the whole of the conditional-chrome
 * rule: no host provider, no toggle and no other visual trace.
 */
export interface DisplayPreviewView {
  /** A host supplied `renderPreview` — the only reason the toggle exists. */
  available: boolean
  /** The host render is showing in place of the designer's own preview. */
  active: boolean
  toggle: () => void
  /** What the canvas area points its `<img>` at, or `null` before the first answer. */
  imageUrl: string | null
  /** A render is in flight — a subtle signal, not a blocking one. */
  loading: boolean
  /** The provider's failure, stated in the preview area instead of an image. */
  error: string | null
  /**
   * The host render's bytes, for Copy/Download PNG — the whole point of
   * keeping those two live in preview mode. `null` while nothing is rendered.
   */
  getImageBlob: () => Promise<Blob | null>
}

interface DisplayPreviewOptions {
  /** Host-side renderer, absent for standalone and for embeds that pass none. */
  renderPreview?: HostPreviewRenderer
  /** The designer's one payload read (App's `readCurrentPayload`). */
  readPayload: () => string
  /** The dither control's current value — a change re-requests the render. */
  ditherMode: DitherMode
  /** The display the design is pinned to, as `onAction` reports it. */
  targetId?: string
  /**
   * Identity changes exactly when the payload can have changed (the live
   * `elements` array): the trigger for a debounced re-request. Read as an
   * effect dependency only — the payload text itself comes from
   * {@link DisplayPreviewOptions.readPayload} at request time, so a request
   * always carries the *current* payload, never a render-time snapshot of it.
   */
  payloadRevision: unknown
}

/** A rejection's own words when it has any — hosts state real reasons. */
function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  return DISPLAY_PREVIEW_FAILED_MESSAGE
}

interface PreviewImage {
  /** What the `<img>` points at. */
  url: string
  /** The bytes, when the provider handed over a Blob rather than a URL. */
  blob: Blob | null
}

export function useDisplayPreview({
  renderPreview,
  readPayload,
  ditherMode,
  targetId,
  payloadRevision,
}: DisplayPreviewOptions): DisplayPreviewView {
  const available = renderPreview != null
  const [active, setActive] = useState(false)
  const [image, setImage] = useState<PreviewImage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readPayloadRef = useRef(readPayload)
  useEffect(() => {
    readPayloadRef.current = readPayload
  })

  /**
   * The request every answer is matched against (issue #109; the #115/#116
   * lesson): a host render can answer out of order, so a response whose token
   * is no longer the current one is dropped instead of painted. Bumped by every
   * new request *and* by leaving preview mode, so nothing in flight can land on
   * a screen that has moved on.
   */
  const requestTokenRef = useRef(0)
  /** Only object URLs this hook minted may be revoked — a host URL is not ours. */
  const ownedUrlRef = useRef<string | null>(null)

  const releaseOwnedUrl = useCallback(() => {
    if (ownedUrlRef.current != null) {
      URL.revokeObjectURL(ownedUrlRef.current)
      ownedUrlRef.current = null
    }
  }, [])

  const clearImage = useCallback(() => {
    releaseOwnedUrl()
    setImage(null)
  }, [releaseOwnedUrl])

  useEffect(() => releaseOwnedUrl, [releaseOwnedUrl])

  const toggle = useCallback(() => {
    // Invalidate whatever is in flight before the mode flips, so a render that
    // answers after the user left cannot repaint the canvas, and re-entering
    // starts from a clean slate rather than a remembered old image.
    requestTokenRef.current += 1
    setActive((current) => !current)
    setLoading(false)
    setError(null)
    clearImage()
  }, [clearImage])

  useEffect(() => {
    if (!active || !renderPreview) {
      return
    }

    const token = (requestTokenRef.current += 1)
    const timer = window.setTimeout(() => {
      // Announced when the request actually goes out, not when it is merely
      // scheduled: a burst of keystrokes collapses into one, so the chip
      // appears once — and never flickers for a request that got debounced
      // away. (Also keeps this effect body free of synchronous setState.)
      setLoading(true)
      let answer: Promise<Blob | string>
      try {
        answer = Promise.resolve(
          renderPreview(readPayloadRef.current(), {
            targetId,
            service: { dither: ditherMode },
          }),
        )
      } catch (thrown) {
        // A provider that throws synchronously fails the same way one that
        // rejects does — never silently.
        answer = Promise.reject(thrown)
      }

      void answer.then(
        (result) => {
          if (requestTokenRef.current !== token) {
            return
          }
          if (typeof result === 'string' && result.length > 0) {
            releaseOwnedUrl()
            setImage({ url: result, blob: null })
          } else if (result instanceof Blob) {
            releaseOwnedUrl()
            const url = URL.createObjectURL(result)
            ownedUrlRef.current = url
            setImage({ url, blob: result })
          } else {
            setError(DISPLAY_PREVIEW_NO_IMAGE_MESSAGE)
            clearImage()
            setLoading(false)
            return
          }
          setError(null)
          setLoading(false)
        },
        (thrown: unknown) => {
          if (requestTokenRef.current !== token) {
            return
          }
          // A stated error beats a stale or wrong render: the image goes.
          setError(failureMessage(thrown))
          clearImage()
          setLoading(false)
        },
      )
    }, DISPLAY_PREVIEW_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [active, clearImage, ditherMode, payloadRevision, releaseOwnedUrl, renderPreview, targetId])

  const getImageBlob = useCallback(async (): Promise<Blob | null> => {
    if (!image) {
      return null
    }
    if (image.blob) {
      return image.blob
    }
    // A host that answered with a URL still owes Copy/Download PNG the bytes;
    // reading them back is the host page's own fetch, and a failure surfaces
    // as the export action's error feedback.
    const response = await fetch(image.url)
    return await response.blob()
  }, [image])

  return {
    available,
    active: available && active,
    toggle,
    imageUrl: image?.url ?? null,
    loading,
    error,
    getImageBlob,
  }
}
