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

/**
 * Canvas shortcuts yield to YAML editing and form fields.
 *
 * Shadow DOM (issue #21): the listener sits on `window`, where events from
 * inside a shadow tree arrive retargeted to the shadow host — `event.target`
 * hides the element the user is typing into. The composed path recovers the
 * real target. `scopeRoot` (the root node the canvas lives in) additionally
 * confines an embedded instance to its own events: keystrokes on the host
 * page — or in another designer instance — never travel through this
 * instance's shadow root, so they are ignored. Standalone passes `document`,
 * which every composed path includes, preserving app-global shortcuts.
 */
export function shouldHandleCanvasKeyboard(event: KeyboardEvent, scopeRoot?: Node): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (scopeRoot && path.length > 0 && !path.includes(scopeRoot)) {
    return false
  }
  const target = path[0] ?? event.target
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
