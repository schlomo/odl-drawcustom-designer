import { Transaction } from '@codemirror/state'

/** Only report cursor moves when the selection is collapsed (not mid drag-select). */
export function shouldReportYamlCursorPosition(selection: { empty: boolean }): boolean {
  return selection.empty
}

/** Ignore programmatic doc replacements (property panel / canvas → YAML sync). */
export function shouldReportYamlDocChange(
  docChanged: boolean,
  transactions: readonly Transaction[],
): boolean {
  if (!docChanged) {
    return false
  }
  return transactions.some((tr) => tr.annotation(Transaction.userEvent) != null)
}

/** Linked canvas selection should move when the YAML editor has focus or is being clicked. */
export function shouldSyncYamlCursorToCanvas(
  viewHasFocus: boolean,
  pointerActive = false,
): boolean {
  return viewHasFocus || pointerActive
}

export interface LinkedYamlCursorUpdate {
  selectionSet: boolean
  docChanged: boolean
  viewHasFocus: boolean
  pointerActive: boolean
  selectionEmpty: boolean
  userInitiated: boolean
}

/** Whether a CodeMirror update should drive canvas selection from the YAML cursor. */
export function shouldReportLinkedYamlCursor(update: LinkedYamlCursorUpdate): boolean {
  if (!update.selectionSet && !update.docChanged) {
    return false
  }
  if (update.docChanged && !update.selectionSet) {
    return false
  }
  if (!shouldReportYamlCursorPosition({ empty: update.selectionEmpty })) {
    return false
  }
  if (!shouldSyncYamlCursorToCanvas(update.viewHasFocus, update.pointerActive)) {
    return false
  }

  if (update.docChanged && update.selectionSet) {
    return true
  }

  return update.userInitiated || update.pointerActive
}

/** Linked canvas scroll should not reset an active range selection in the editor. */
export function shouldMoveCursorOnLinkedScroll(selection: { empty: boolean }): boolean {
  return selection.empty
}
