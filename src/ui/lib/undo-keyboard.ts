/** True for Ctrl/Cmd+Z without Shift (undo). */
export function isUndoShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey
}

/** True for Ctrl/Cmd+Shift+Z or Ctrl+Y (redo). */
export function isRedoShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey && event.key.toLowerCase() === 'y') {
    return false
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'y' && !event.metaKey) {
    return true
  }
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && event.shiftKey
}
