import { collectRequiredFontKeys, scanFontReferences, type DrawElement, type RenderContext } from '../../core'
import type { FontLoadOutcome } from './font-load-outcome'
import { formatElementIndexList, getFontStatusMessages } from './font-readiness'
import { collectElementRenderErrors } from './render-error-messages'
import type { StatusMessage } from './status-messages'

/**
 * Maintainer manual-test finding on PR #54: a single font-unavailable
 * failure produced TWO overlapping banners for the same underlying cause —
 * a font-level "Font not available"/"Font failed to load" banner
 * (font-readiness.ts) and a per-element "Element N could not be rendered"
 * banner (render-error-messages.ts), because issue #53's
 * renderText/renderMultiline throw that SAME font-unavailable message
 * verbatim once a font is confirmed missing/failed. Maintainer ruling: one
 * failure = one banner.
 *
 * This merges the two builders' output: for every required font key whose
 * outcome is missing/failed AND which has at least one associated render
 * error, emit exactly one banner naming the font and every affected
 * element, instead of one banner per builder. Anything else — the loading
 * banner, templated-font warnings, glyph-coverage warnings, a missing/failed
 * font with no associated render error (e.g. a `plot`/`progress_bar`
 * element, whose renderers don't yet throw on an unavailable font), and any
 * render error NOT caused by a font-unavailable outcome — passes through
 * unchanged from the two existing builders.
 */
export function getMergedStatusMessages(
  elements: readonly DrawElement[],
  ctx: RenderContext,
  outcomes: ReadonlyMap<string, FontLoadOutcome>,
  fontsLoading: boolean,
): StatusMessage[] {
  const fontKeyByElementIndex = new Map<number, string>()
  for (const reference of scanFontReferences(elements)) {
    if (!reference.templated) {
      fontKeyByElementIndex.set(reference.elementIndex, reference.key)
    }
  }

  const renderErrors = collectElementRenderErrors(elements, ctx)
  const requiredKeys = collectRequiredFontKeys(elements)

  const mergedMessages: StatusMessage[] = []
  const consumedElementIndices = new Set<number>()
  const consumedFontKeys = new Set<string>()

  for (const key of requiredKeys) {
    const outcome = outcomes.get(key)
    if (outcome?.status !== 'missing' && outcome?.status !== 'failed') {
      continue
    }

    const matchedIndices = renderErrors
      .filter((error) => fontKeyByElementIndex.get(error.index) === key)
      .map((error) => error.index)
      .sort((a, b) => a - b)

    if (matchedIndices.length === 0) {
      // No element actually failed to render because of this font (e.g. a
      // `plot`/`progress_bar` element referencing it) — nothing to merge,
      // leave the plain font-status banner as the sole banner for this key.
      continue
    }

    matchedIndices.forEach((index) => consumedElementIndices.add(index))
    consumedFontKeys.add(key)

    const isMissing = outcome.status === 'missing'
    const elementLabel = matchedIndices.length === 1 ? 'element' : 'elements'
    const elementList = formatElementIndexList(matchedIndices)

    mergedMessages.push({
      severity: 'error',
      title: isMissing ? 'Font not available' : 'Font failed to load',
      summary: `${outcome.message ?? `${key} is unavailable.`} Affects ${elementLabel} ${elementList}.`,
      detail: isMissing
        ? "Upload the font in Content Manager or switch to a bundled font (ppb.ttf, rbm.ttf). Showing a placeholder outline at the affected element(s)' position instead of hiding them."
        : "Preview text metrics and glyph shapes may not match the device. Showing a placeholder outline at the affected element(s)' position instead of hiding them.",
    })
  }

  const standaloneRenderErrorMessages: StatusMessage[] = renderErrors
    .filter((error) => !consumedElementIndices.has(error.index))
    .map(({ index, message }) => ({
      severity: 'error' as const,
      title: 'Element failed to render',
      summary: `Element ${index + 1} could not be rendered: ${message}`,
      detail:
        'Showing a placeholder outline at its position instead of hiding it. Check its properties (e.g. font) and fix or remove the element.',
    }))

  // Hide the font key from getFontStatusMessages' own missing/failed
  // handling once we've merged it above — it's already covered by
  // mergedMessages. This also correctly excludes it from "loading" and
  // "all fonts ready" (glyph coverage) checks, matching its real state.
  const outcomesForFontBanner = new Map(outcomes)
  for (const key of consumedFontKeys) {
    outcomesForFontBanner.delete(key)
  }

  return [
    ...standaloneRenderErrorMessages,
    ...getFontStatusMessages(elements, outcomesForFontBanner, fontsLoading),
    ...mergedMessages,
  ]
}
