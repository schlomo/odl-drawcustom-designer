import { DRAW_ELEMENT_TYPES, type DrawElement } from '../../core'
import { ELEMENT_TYPE_ICONS } from './element-type-icons'

/** Per-button chrome: horizontal padding, border, icon, and icon–label gap (px). */
export const ELEMENT_TOOLBAR_BUTTON_CHROME_PX = 32
/** Toolbar horizontal padding (`px-2` both sides). */
export const ELEMENT_TOOLBAR_PADDING_PX = 16
/** Gap between buttons (`gap-1`). */
export const ELEMENT_TOOLBAR_GAP_PX = 4
/** Approximate width of one character at `text-[11px]`. */
export const ELEMENT_TOOLBAR_LABEL_CHAR_PX = 6.5

/** Extra slack for font/rendering variance and borders. */
export const ELEMENT_TOOLBAR_WIDTH_SAFETY_PX = 64

/** Minimum toolbar width for icon + label buttons to stay on one row. */
export function labeledElementToolbarMinWidth(
  types: readonly DrawElement['type'][] = DRAW_ELEMENT_TYPES,
): number {
  let width = ELEMENT_TOOLBAR_PADDING_PX
  for (const type of types) {
    const label = ELEMENT_TYPE_ICONS[type].shortLabel
    width += ELEMENT_TOOLBAR_BUTTON_CHROME_PX + label.length * ELEMENT_TOOLBAR_LABEL_CHAR_PX
  }
  if (types.length > 1) {
    width += ELEMENT_TOOLBAR_GAP_PX * (types.length - 1)
  }
  return Math.ceil(width + ELEMENT_TOOLBAR_WIDTH_SAFETY_PX)
}

export function elementToolbarLabelsFit(toolbarWidth: number): boolean {
  if (toolbarWidth <= 0) {
    return false
  }
  return toolbarWidth >= labeledElementToolbarMinWidth()
}

export function countElementToolbarRows(container: HTMLElement): number {
  const buttons = container.querySelectorAll<HTMLElement>('[data-element-toolbar]')
  if (buttons.length === 0) {
    return 0
  }
  return new Set(Array.from(buttons, (button) => button.offsetTop)).size
}
