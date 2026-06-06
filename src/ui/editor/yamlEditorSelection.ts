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

/** Linked canvas selection should move only when the YAML editor has focus. */
export function shouldSyncYamlCursorToCanvas(viewHasFocus: boolean): boolean {
  return viewHasFocus
}

/** Linked canvas scroll should not reset an active range selection in the editor. */
export function shouldMoveCursorOnLinkedScroll(selection: { empty: boolean }): boolean {
  return selection.empty
}
