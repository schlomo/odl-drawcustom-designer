import { collectRequiredFontKeys, scanFontReferences, type DrawElement, type RenderContext } from '../../core'
import type { FontLoadOutcome } from './font-load-outcome'
import { formatElementIndexList, getFontStatusMessages } from './font-readiness'
import type { ImageLoadOutcome } from './image-load-outcome'
import { getImageStatusMessages } from './image-readiness'
import { collectElementRenderErrors } from './render-error-messages'
import type { StatusMessage } from './status-messages'

/** Every dlimg element index -> its `url`, for correlating render errors with image outcomes. */
function imageKeyByElementIndex(elements: readonly DrawElement[]): Map<number, string> {
  const map = new Map<number, string>()
  elements.forEach((element, index) => {
    if (element.type === 'dlimg' && element.url) {
      map.set(index, element.url)
    }
  })
  return map
}

/** Every dlimg `url` referenced by elements, deduped — mirrors collectRequiredFontKeys for images. */
function collectRequiredImageKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()
  for (const element of elements) {
    if (element.type === 'dlimg' && element.url) {
      keys.add(element.url)
    }
  }
  return [...keys].sort()
}

interface AssetOutcomeLike {
  status: string
  message?: string
}

/**
 * Shared merge step for one asset kind (font or image): for every required
 * key whose outcome is missing/failed AND which has at least one associated
 * render error, produce exactly one banner naming the asset and every
 * affected element, and record which element indices + keys got consumed so
 * the caller can exclude them from the plain per-asset banner list and the
 * generic standalone render-error list.
 */
function mergeAssetFailures<TOutcome extends AssetOutcomeLike>(
  requiredKeys: readonly string[],
  outcomes: ReadonlyMap<string, TOutcome>,
  keyByElementIndex: ReadonlyMap<number, string>,
  renderErrors: readonly { index: number; message: string }[],
  buildMessage: (outcome: TOutcome, key: string, elementLabel: string, elementList: string) => StatusMessage,
): { messages: StatusMessage[]; consumedElementIndices: Set<number>; consumedKeys: Set<string> } {
  const messages: StatusMessage[] = []
  const consumedElementIndices = new Set<number>()
  const consumedKeys = new Set<string>()

  for (const key of requiredKeys) {
    const outcome = outcomes.get(key)
    // Deliberately an explicit allow-list (not e.g. `!== 'ready'`), so a
    // future status added to FontLoadStatus/ImageLoadStatus (something
    // between "ready" and "confirmed gone") is safely skipped here by
    // default, rather than silently reaching `buildMessage` below — which
    // only knows how to label exactly 'missing' and 'failed' and would
    // mislabel anything else (independent review finding on PR #58).
    if (outcome?.status !== 'missing' && outcome?.status !== 'failed') {
      continue
    }

    const matchedIndices = renderErrors
      .filter((error) => keyByElementIndex.get(error.index) === key)
      .map((error) => error.index)
      .sort((a, b) => a - b)

    if (matchedIndices.length === 0) {
      // No element actually failed to render because of this asset (e.g. a
      // `plot`/`progress_bar` element whose font isn't used, per issue #53) —
      // nothing to merge, leave the plain asset-status banner as the sole
      // banner for this key.
      continue
    }

    matchedIndices.forEach((index) => consumedElementIndices.add(index))
    consumedKeys.add(key)

    const elementLabel = matchedIndices.length === 1 ? 'element' : 'elements'
    const elementList = formatElementIndexList(matchedIndices)
    messages.push(buildMessage(outcome, key, elementLabel, elementList))
  }

  return { messages, consumedElementIndices, consumedKeys }
}

/**
 * Maintainer manual-test finding on PR #54: a single font-unavailable
 * failure produced TWO overlapping banners for the same underlying cause —
 * a font-level "Font not available"/"Font failed to load" banner
 * (font-readiness.ts) and a per-element "Element N could not be rendered"
 * banner (render-error-messages.ts), because issue #53's
 * renderText/renderMultiline throw that SAME font-unavailable message
 * verbatim once a font is confirmed missing/failed. Maintainer ruling: one
 * failure = one banner. Issue #55 extends the exact same treatment to dlimg
 * images (an "Image not available"/"Image failed to load" banner,
 * image-readiness.ts, vs. the same render-error banner).
 *
 * This merges each asset kind's status-banner builder with the render-error
 * builder: for every required key whose outcome is missing/failed AND which
 * has at least one associated render error, emit exactly one banner naming
 * the asset and every affected element, instead of one banner per builder.
 * Anything else — the loading banner, templated-font warnings, glyph-
 * coverage warnings, a missing/failed asset with no associated render error
 * (e.g. a `plot`/`progress_bar` element whose font isn't used), a
 * deliberately 'suppressed' image outcome, and any render error NOT caused
 * by a font/image-unavailable outcome — passes through unchanged from the
 * existing builders.
 */
export function getMergedStatusMessages(
  elements: readonly DrawElement[],
  ctx: RenderContext,
  fontOutcomes: ReadonlyMap<string, FontLoadOutcome>,
  fontsLoading: boolean,
  imageOutcomes: ReadonlyMap<string, ImageLoadOutcome> = new Map(),
): StatusMessage[] {
  const fontKeyByElementIndex = new Map<number, string>()
  for (const reference of scanFontReferences(elements)) {
    if (!reference.templated) {
      fontKeyByElementIndex.set(reference.elementIndex, reference.key)
    }
  }

  const renderErrors = collectElementRenderErrors(elements, ctx)

  const fontMerge = mergeAssetFailures(
    collectRequiredFontKeys(elements),
    fontOutcomes,
    fontKeyByElementIndex,
    renderErrors,
    (outcome, key, elementLabel, elementList) => {
      const isMissing = outcome.status === 'missing'
      return {
        severity: 'error',
        title: isMissing ? 'Font not available' : 'Font failed to load',
        summary: `${outcome.message ?? `${key} is unavailable.`} Affects ${elementLabel} ${elementList}.`,
        detail: isMissing
          ? "Upload the font in Content Manager or switch to a bundled font (ppb.ttf, rbm.ttf). Showing a placeholder outline at the affected element(s)' position instead of hiding them."
          : "Preview text metrics and glyph shapes may not match the device. Showing a placeholder outline at the affected element(s)' position instead of hiding them.",
      }
    },
  )

  const imageMerge = mergeAssetFailures(
    collectRequiredImageKeys(elements),
    imageOutcomes,
    imageKeyByElementIndex(elements),
    renderErrors,
    (outcome, key, elementLabel, elementList) => {
      const isMissing = outcome.status === 'missing'
      return {
        severity: 'error',
        title: isMissing ? 'Image not available' : 'Image failed to load',
        summary: `${outcome.message ?? `${key} is unavailable.`} Affects ${elementLabel} ${elementList}.`,
        detail: isMissing
          ? "Upload the image in Content Manager, or fix the referenced path. Showing a placeholder outline at the affected element(s)' position instead of hiding them."
          : "Check the uploaded file is a valid, supported image format. Showing a placeholder outline at the affected element(s)' position instead of hiding them.",
      }
    },
  )

  const consumedElementIndices = new Set([
    ...fontMerge.consumedElementIndices,
    ...imageMerge.consumedElementIndices,
  ])

  const standaloneRenderErrorMessages: StatusMessage[] = renderErrors
    .filter((error) => !consumedElementIndices.has(error.index))
    .map(({ index, message }) => ({
      severity: 'error' as const,
      title: 'Element failed to render',
      summary: `Element ${index + 1} could not be rendered: ${message}`,
      detail:
        'Showing a placeholder outline at its position instead of hiding it. Check its properties (e.g. font) and fix or remove the element.',
    }))

  // Hide each consumed key from its plain per-asset banner handling once
  // we've merged it above — it's already covered by the merged messages.
  // This also correctly excludes it from "loading"/"all fonts ready" (glyph
  // coverage) checks, matching its real state.
  const outcomesForFontBanner = new Map(fontOutcomes)
  for (const key of fontMerge.consumedKeys) {
    outcomesForFontBanner.delete(key)
  }
  const outcomesForImageBanner = new Map(imageOutcomes)
  for (const key of imageMerge.consumedKeys) {
    outcomesForImageBanner.delete(key)
  }

  return [
    ...standaloneRenderErrorMessages,
    ...getFontStatusMessages(elements, outcomesForFontBanner, fontsLoading),
    ...getImageStatusMessages(elements, outcomesForImageBanner),
    ...fontMerge.messages,
    ...imageMerge.messages,
  ]
}
