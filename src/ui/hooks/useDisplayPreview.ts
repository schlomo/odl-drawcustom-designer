import { useCallback, useEffect, useRef, useState } from 'react'
import type { DitherMode } from '../../core'
import type { HostPreviewDisplayGeometry, HostPreviewRenderer } from '../../embed/types'

/**
 * A burst of changes collapses into one host render request (issue #109): a
 * host render is a round trip to real hardware or a real rasterizer, so it must
 * not fire per change. What can change while the preview shows is a host
 * `setPayload()` push, the display config (a resolution pick, a
 * re-orientation), the selected display and the dither control — the design
 * itself cannot, since every editing affordance is inert. Long enough to
 * swallow a burst, short enough that the preview visibly follows.
 */
export const DISPLAY_PREVIEW_DEBOUNCE_MS = 250

/** Shown when the provider rejects without a message of its own. */
export const DISPLAY_PREVIEW_FAILED_MESSAGE = 'The host could not render this preview'

/** Copy/Download PNG while the first host render is still in flight. */
export const DISPLAY_PREVIEW_NOT_READY_MESSAGE = 'Display preview is still rendering'

/** Shown when a provider resolves with something that is not an image. */
export const DISPLAY_PREVIEW_NO_IMAGE_MESSAGE = 'The host returned no preview image'

/**
 * Why the toggle is disabled while the YAML doc is broken (maintainer ruling
 * 2026-08-17). Entering a preview of a *broken* document would render the
 * last-valid payload — an image of something other than what the editor shows —
 * and the alternative, a YAML-error overlay painted over a host render, would
 * explain the preview as an error state, which it never is. Refusing to enter is
 * also what makes preview mode unbreakable from inside: the editor is read-only
 * there and a host push parses or throws, so the document cannot go bad while a
 * render is on screen.
 */
export const DISPLAY_PREVIEW_YAML_BLOCKED_REASON = 'Fix the YAML errors to preview'

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
  /**
   * Why the toggle refuses to enter preview mode right now, `null` when it does
   * not — the same disabled-with-a-stated-reason pattern the host action buttons
   * use. Never set while {@link DisplayPreviewView.active}: leaving must always
   * be possible.
   */
  disabledReason: string | null
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
  /**
   * The logical surface the payload is authored against — a change to it (a
   * resolution pick, a re-orientation) re-requests the render, because a host
   * that rendered the old geometry is showing a picture of a different canvas.
   * Must be a **stable object** (the caller memoizes it): it is an effect
   * dependency, so a fresh identity per render would re-request forever.
   */
  display: HostPreviewDisplayGeometry
  /** The display the design is pinned to, as `onAction` reports it. */
  targetId?: string
  /**
   * Why entering preview mode is refused right now (a blocked YAML document),
   * or `null`/absent when it is not.
   */
  blockedReason?: string | null
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
  display,
  targetId,
  blockedReason = null,
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

  /**
   * Sequencing fix (maintainer manual-validation finding on PR #143, video
   * evidence): a geometry change (a resolution pick, a re-orientation) used
   * to leave the *old* image on screen until the re-request answered — the
   * canvas re-orients first, the stale image letterboxes into the new shape,
   * then the new render lands. Two visible size jumps instead of one clean
   * transition.
   *
   * Dither and target-driven re-requests deliberately keep the old behavior
   * (swap in place once the new answer lands): dither can never change the
   * image's dimensions, so there is nothing to letterbox. Only `display`
   * (width/height/rotation) triggers this immediate clear — tracked against
   * the previous value here, not derived from the debounced-request effect
   * below, so the paper goes blank (and the loading chip appears) the instant
   * the geometry changes, well before the 250ms debounce even schedules the
   * re-request.
   */
  const previousDisplayRef = useRef(display)
  useEffect(() => {
    const previous = previousDisplayRef.current
    previousDisplayRef.current = display
    if (!active) {
      return
    }
    const geometryChanged =
      previous.width !== display.width ||
      previous.height !== display.height ||
      previous.rotation !== display.rotation
    if (!geometryChanged) {
      return
    }
    setError(null)
    clearImage()
    setLoading(true)
  }, [active, clearImage, display])

  // Leaving is always allowed; only entering can be refused.
  const disabledReason = active ? null : blockedReason

  const toggle = useCallback(() => {
    // The button is disabled, so this is belt and braces — but a preview of a
    // document the editor does not show must be unreachable, not merely hard to
    // reach.
    if (!active && blockedReason != null) {
      return
    }
    // Invalidate whatever is in flight before the mode flips, so a render that
    // answers after the user left cannot repaint the canvas, and re-entering
    // starts from a clean slate rather than a remembered old image.
    requestTokenRef.current += 1
    setActive((current) => !current)
    setLoading(false)
    setError(null)
    clearImage()
  }, [active, blockedReason, clearImage])

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
            display,
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

    return () => {
      window.clearTimeout(timer)
      // Retire this run's token as the run ends — on supersession *and* on
      // unmount. Without it, a response arriving after the component is gone
      // still passed the token check and minted an object URL nothing would
      // ever revoke (the release effect has already run): one leaked blob per
      // in-flight render, for the lifetime of the host page.
      requestTokenRef.current += 1
    }
  }, [
    active,
    clearImage,
    display,
    ditherMode,
    payloadRevision,
    releaseOwnedUrl,
    renderPreview,
    targetId,
  ])

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
    disabledReason,
    toggle,
    imageUrl: image?.url ?? null,
    loading,
    error,
    getImageBlob,
  }
}
