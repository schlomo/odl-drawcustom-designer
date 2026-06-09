/** Multi-select floating toolbar may use at most this fraction of the canvas section width. */
export const CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO = 0.9

export function countToolbarRows(container: HTMLElement, selector: string): number {
  const buttons = container.querySelectorAll<HTMLElement>(selector)
  if (buttons.length === 0) {
    return 0
  }
  return new Set(Array.from(buttons, (button) => button.offsetTop)).size
}

export function canvasSelectionToolbarMaxWidth(sectionWidth: number): number {
  if (sectionWidth <= 0) {
    return 0
  }
  return Math.floor(sectionWidth * CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO)
}
