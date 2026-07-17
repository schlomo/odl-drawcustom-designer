import { ChangeSet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { EditorView as EditorViewType } from '@codemirror/view'
import { elementIndexAtOffset, findElementSpans } from '../../core'

export interface StoredEditorSelection {
  anchor: number
  head: number
}

function specHasExplicitSelection(
  spec: Parameters<EditorViewType['dispatch']>[0],
): boolean {
  return spec != null && 'selection' in spec && spec.selection !== undefined
}

/** Map a cursor offset across canvas-driven full YAML re-serialization. */
export function mapPositionAcrossYamlResync(
  oldDoc: string,
  newDoc: string,
  pos: number,
): number {
  if (oldDoc === newDoc) {
    return pos
  }

  const clamped = Math.max(0, Math.min(pos, oldDoc.length))
  const elementIndex = elementIndexAtOffset(oldDoc, clamped)
  if (elementIndex == null) {
    return Math.min(clamped, newDoc.length)
  }

  const oldSpan = findElementSpans(oldDoc)[elementIndex]
  const newSpan = findElementSpans(newDoc)[elementIndex]
  if (!oldSpan || !newSpan) {
    return Math.min(clamped, newDoc.length)
  }

  const blockLength = Math.max(1, oldSpan.end - oldSpan.start)
  const offsetInBlock = Math.max(0, Math.min(clamped - oldSpan.start, blockLength))
  return Math.min(newSpan.start + offsetInBlock, newSpan.end, newDoc.length)
}

function mapSelectionThroughChanges(
  oldDoc: string,
  anchor: number,
  head: number,
  changes: NonNullable<Parameters<EditorViewType['dispatch']>[0]>['changes'],
): StoredEditorSelection {
  if (changes == null) {
    return { anchor, head }
  }

  const changeList = Array.isArray(changes) ? changes : [changes]
  const fullReplace =
    changeList.length === 1 &&
    changeList[0]?.from === 0 &&
    changeList[0]?.to === oldDoc.length &&
    typeof changeList[0]?.insert === 'string'

  if (fullReplace) {
    const newDoc = changeList[0]!.insert as string
    return {
      anchor: mapPositionAcrossYamlResync(oldDoc, newDoc, anchor),
      head: mapPositionAcrossYamlResync(oldDoc, newDoc, head),
    }
  }

  const changeSet = ChangeSet.of(changeList, oldDoc.length)
  return {
    anchor: changeSet.mapPos(anchor, -1),
    head: changeSet.mapPos(head, -1),
  }
}

function restoreScrollPosition(
  view: EditorViewType,
  scrollTop: number,
  scrollLeft: number,
): void {
  const apply = () => {
    view.scrollDOM.scrollTop = scrollTop
    view.scrollDOM.scrollLeft = scrollLeft
  }
  apply()
  requestAnimationFrame(apply)
}

export interface DispatchPreservingEditorViewStateOptions {
  /**
   * Set when `spec` carries its own intentional scroll target (e.g. a
   * `scrollLinkedElementIntoView` effect for a fresh canvas selection).
   * An intentional scroll always wins over restoring the pre-dispatch
   * scrollTop — otherwise the restore fires synchronously (and again next
   * rAF) and clobbers the scroll-into-view effect dispatched in the same
   * transaction.
   */
  skipScrollRestore?: boolean
}

/** Keep YAML scroll and selection when syncing canvas edits without linked scroll. */
export function dispatchPreservingEditorViewState(
  view: EditorViewType,
  spec: Parameters<EditorViewType['dispatch']>[0],
  selectionStore?: { current: StoredEditorSelection },
  scrollStore?: { current: number },
  options?: DispatchPreservingEditorViewStateOptions,
): void {
  const scrollTop = scrollStore?.current ?? view.scrollDOM.scrollTop
  const scrollLeft = view.scrollDOM.scrollLeft
  const oldDoc = view.state.doc.toString()
  const stored = selectionStore?.current
  const { anchor, head } = stored ?? view.state.selection.main

  let merged: Parameters<EditorViewType['dispatch']>[0] = spec
  if (!specHasExplicitSelection(spec)) {
    const mapped = mapSelectionThroughChanges(oldDoc, anchor, head, spec?.changes)
    merged = {
      ...spec,
      selection: mapped,
      scrollIntoView: false,
    }
    if (selectionStore) {
      selectionStore.current = mapped
    }
  } else if (spec != null) {
    merged = { ...spec, scrollIntoView: false }
  }

  view.dispatch(merged)
  if (!options?.skipScrollRestore) {
    restoreScrollPosition(view, scrollTop, scrollLeft)
  }
}

export function scrollLinkedElementIntoView(position: number) {
  return EditorView.scrollIntoView(position, { y: 'center', yMargin: 24 })
}

/** Track YAML scroller position for restore after programmatic doc sync. */
export function bindYamlScrollStore(
  view: EditorViewType,
  scrollStore: { current: number },
): () => void {
  const onScroll = () => {
    scrollStore.current = view.scrollDOM.scrollTop
  }
  onScroll()
  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
  return () => view.scrollDOM.removeEventListener('scroll', onScroll)
}
