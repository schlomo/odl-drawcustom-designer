/** Tailwind `gap-2` between the panel title and toolbar. */
export const TOOLBAR_HEADER_TITLE_GAP_PX = 8

/** Width available to a right-aligned toolbar beside a panel heading. */
export function toolbarHeaderSlotWidth(
  headerWidth: number,
  titleWidth: number,
  gapPx = TOOLBAR_HEADER_TITLE_GAP_PX,
): number {
  if (headerWidth <= 0 || titleWidth <= 0) {
    return 0
  }
  return Math.max(0, Math.floor(headerWidth - titleWidth - gapPx))
}
