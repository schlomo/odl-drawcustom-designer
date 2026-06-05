/** Only report cursor moves when the selection is collapsed (not mid drag-select). */
export function shouldReportYamlCursorPosition(selection: { empty: boolean }): boolean {
  return selection.empty
}

/** Linked canvas scroll should not reset an active range selection in the editor. */
export function shouldMoveCursorOnLinkedScroll(selection: { empty: boolean }): boolean {
  return selection.empty
}
