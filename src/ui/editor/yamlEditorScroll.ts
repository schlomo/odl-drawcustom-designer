import { ChangeSet } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { EditorView as EditorViewType } from '@codemirror/view'
import { locateElementIndexAtPosition } from './locateElementInYaml'
import { findListItemSpans } from './yamlIssueRanges'

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
  const elementIndex = locateElementIndexAtPosition(oldDoc, clamped)
  if (elementIndex == null) {
    return Math.min(clamped, newDoc.length)
  }

  const oldSpan = findListItemSpans(oldDoc)[elementIndex]
  const newSpan = findListItemSpans(newDoc)[elementIndex]
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

/** Keep YAML scroll and selection when syncing canvas edits without linked scroll. */
export function dispatchPreservingEditorViewState(
  view: EditorViewType,
  spec: Parameters<EditorViewType['dispatch']>[0],
  selectionStore?: { current: StoredEditorSelection },
): void {
  const scrollTop = view.scrollDOM.scrollTop
  const scrollLeft = view.scrollDOM.scrollLeft
  const oldDoc = view.state.doc.toString()
  const stored = selectionStore?.current
  const { anchor, head } = stored ?? view.state.selection.main

  let merged = spec
  if (!specHasExplicitSelection(spec)) {
    const mapped = mapSelectionThroughChanges(oldDoc, anchor, head, spec?.changes)
    merged = {
      ...spec,
      selection: mapped,
    }
    if (selectionStore) {
      selectionStore.current = mapped
    }
  }

  view.dispatch(merged)
  view.scrollDOM.scrollTop = scrollTop
  view.scrollDOM.scrollLeft = scrollLeft
}

/** @deprecated Use {@link dispatchPreservingEditorViewState}. */
export const dispatchPreservingEditorScroll = dispatchPreservingEditorViewState

export function scrollLinkedElementIntoView(position: number) {
  return EditorView.scrollIntoView(position, { y: 'center', yMargin: 24 })
}
