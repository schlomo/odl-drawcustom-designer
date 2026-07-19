/**
 * Mirrors font-load-outcome.ts's FontLoadOutcome shape for dlimg image
 * assets (issue #55). 'suppressed' is image-specific: the bundled showcase
 * demo image, when the user has dismissed it (`shouldUseBundledShowcaseImage`
 * returns false) — a deliberate user choice, not a missing-asset error, so
 * it must never produce a render-error marker or status banner. Handled the
 * same as 'ready' everywhere except it never populates the `images` map.
 */
export type ImageLoadStatus = 'ready' | 'missing' | 'failed' | 'suppressed'

export interface ImageLoadOutcome {
  key: string
  status: ImageLoadStatus
  /** User-facing explanation when status is missing or failed. */
  message?: string
}

export interface ImageLoadBatchResult {
  images: Map<string, HTMLImageElement>
  outcomes: Map<string, ImageLoadOutcome>
}

export function areImageLoadOutcomeMapsEqual(
  left: ReadonlyMap<string, ImageLoadOutcome>,
  right: ReadonlyMap<string, ImageLoadOutcome>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, outcome] of left) {
    const other = right.get(key)
    if (!other || other.status !== outcome.status || other.message !== outcome.message) {
      return false
    }
  }

  return true
}
