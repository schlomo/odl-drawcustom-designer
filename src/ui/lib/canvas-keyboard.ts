/** Apply keyboard nudge only when an element is selected (no-op when `selectedIndex` is null). */
export function nudgeWhenSelected(
  selectedIndex: number | null,
  nudge: (index: number, dx: number, dy: number) => void,
  dx: number,
  dy: number,
): void {
  if (selectedIndex == null) {
    return
  }
  nudge(selectedIndex, dx, dy)
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
