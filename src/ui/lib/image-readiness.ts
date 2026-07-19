import type { DrawElement } from '../../core'
import type { ImageLoadOutcome } from './image-load-outcome'
import type { StatusMessage } from './status-messages'

/** Every dlimg `url` referenced by visible-or-not elements, in element order (duplicates kept out). */
function collectRequiredImageKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()
  for (const element of elements) {
    if (element.type === 'dlimg' && element.url) {
      keys.add(element.url)
    }
  }
  return [...keys].sort()
}

/**
 * Mirrors font-readiness.ts's getFontStatusMessages, scoped to the two error
 * cases images actually have today (issue #55): no "loading"/templated/
 * glyph-coverage equivalents for images yet — those weren't asked for and
 * would be speculative UX no one has approved. 'suppressed' (the dismissed
 * bundled showcase image) is deliberately excluded — see
 * ImageLoadStatus's doc comment.
 */
export function getImageStatusMessages(
  elements: readonly DrawElement[],
  outcomes: ReadonlyMap<string, ImageLoadOutcome>,
): StatusMessage[] {
  const messages: StatusMessage[] = []
  const requiredKeys = collectRequiredImageKeys(elements)

  const missingOutcomes = requiredKeys
    .map((key) => outcomes.get(key))
    .filter((outcome): outcome is ImageLoadOutcome => outcome?.status === 'missing')
  const failedOutcomes = requiredKeys
    .map((key) => outcomes.get(key))
    .filter((outcome): outcome is ImageLoadOutcome => outcome?.status === 'failed')

  for (const outcome of missingOutcomes) {
    messages.push({
      severity: 'error',
      title: 'Image not available',
      summary: outcome.message ?? `${outcome.key} is missing.`,
      detail: 'Upload the image in Content Manager, or fix the referenced path.',
    })
  }

  for (const outcome of failedOutcomes) {
    messages.push({
      severity: 'error',
      title: 'Image failed to load',
      summary: outcome.message ?? `${outcome.key} could not be loaded.`,
      detail: 'Check the uploaded file is a valid, supported image format.',
    })
  }

  return messages
}
