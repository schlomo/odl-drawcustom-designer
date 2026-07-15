import type { DrawElement } from '../schema/elements'
import { elementIndexAtOffset, findElementSpans } from './elementSpans'

export interface CursorSelectionResult {
  /** Element index to select, or `null` to leave the current selection untouched. */
  index: number | null
  /**
   * `true` when a pending (debounced) valid parse already matches the live
   * doc's structure and should be flushed synchronously before the caller
   * honors `index` — so the property panel reads the freshest committed data.
   */
  shouldFlushPending: boolean
}

/**
 * Resolve a YAML cursor position to an element index without racing the
 * debounced, validation-gated `elements` array (issue #14).
 *
 * `handleCursorPosition` in `YamlPanel.tsx` used to resolve the index against
 * the *live* CodeMirror doc and call `onSelectElement` unconditionally, even
 * though the committed `elements` array only updates 80ms later and only if
 * the *entire* document still validates. Mid-edit, that races: the live doc
 * can have a different element count than the committed array, so the
 * resolved index no longer points at the same element in `elements`.
 *
 * This function defers (returns a `null` index) whenever the live doc's
 * element count disagrees with `committedElements` — unless `pendingElements`
 * (the not-yet-flushed debounced parse) already reflects the live doc's
 * structure, in which case it's safe to flush that pending parse immediately
 * and trust the resolved index.
 */
export function resolveCursorSelection(
  liveDoc: string,
  cursorPos: number,
  committedElements: DrawElement[],
  pendingElements: DrawElement[] | null,
): CursorSelectionResult {
  const liveIndex = elementIndexAtOffset(liveDoc, cursorPos)
  if (liveIndex == null) {
    return { index: null, shouldFlushPending: false }
  }

  const liveElementCount = findElementSpans(liveDoc).length
  const structurallyInSync = committedElements.length === liveElementCount
  if (structurallyInSync) {
    return { index: liveIndex, shouldFlushPending: false }
  }

  const pendingMatchesLiveStructure =
    pendingElements != null && pendingElements.length === liveElementCount
  if (pendingMatchesLiveStructure) {
    return { index: liveIndex, shouldFlushPending: true }
  }

  return { index: null, shouldFlushPending: false }
}
