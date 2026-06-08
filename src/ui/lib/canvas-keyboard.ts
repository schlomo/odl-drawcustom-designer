/** Apply keyboard nudge to every selected index (no-op when selection is empty). */
export function nudgeWhenSelected(
  selectedIndices: readonly number[],
  nudge: (index: number, dx: number, dy: number) => void,
  dx: number,
  dy: number,
): void {
  if (selectedIndices.length === 0) {
    return
  }
  for (const index of selectedIndices) {
    nudge(index, dx, dy)
  }
}

/** Canvas shortcuts yield to YAML editing and form fields. */
export function shouldHandleCanvasKeyboard(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return true
  }
  if (target.closest('.cm-editor')) {
    return false
  }
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return false
  }
  return true
}
