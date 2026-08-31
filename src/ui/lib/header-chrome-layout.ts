/**
 * Page-header chrome geometry (ADR-016 single-row responsive toolbars).
 *
 * The header is a three-slot row: `[brand] gap [meta] gap [actions]`. Brand and
 * actions are `shrink-0`; the meta column is the flexible one. The measured
 * label-collapse mechanism (`useToolbarLabels`) needs to know how much width the
 * actions row may occupy, which is everything the brand does not take.
 */

/** Marks a header action group for {@link countToolbarRows}-style measurement. */
export const HEADER_TOOLBAR_ITEM_SELECTOR = '[data-header-toolbar]'

/** Tailwind `gap-4` between the header's brand block and the rest of the row. */
export const HEADER_ROW_GAP_PX = 16

/**
 * Width the header's measurement probe may occupy: the header row minus the
 * (never-shrinking) brand block and the gap after it.
 *
 * The probe holds the meta column at its **natural, untruncated** width plus the
 * fully labeled action row, so comparing it against this slot answers the
 * question the maintainer's ruling asks: do the action labels still fit *before*
 * any header text has to give way? Buttons collapse to icons first; only then
 * does the meta column start dropping segments
 * (`resolveVisibleHeaderMetaSegments`).
 */
export function headerProbeSlotWidth(headerRowWidth: number, brandWidth: number): number {
  if (headerRowWidth <= 0 || brandWidth <= 0) {
    return 0
  }
  return Math.max(0, Math.floor(headerRowWidth - brandWidth - HEADER_ROW_GAP_PX))
}

/**
 * Width left for the meta column once the brand block and the *live* (possibly
 * already collapsed) action row have taken theirs. Both gaps of the three-slot
 * row are subtracted: a flex `gap-4` applies between items even when the middle
 * item measures zero.
 *
 * `null` means **not measured yet** — an unmeasured header must keep showing
 * every segment, whereas a measured slot of `0` means there is genuinely no
 * room and every segment goes. Collapsing those two into one number is how a
 * squeezed header ended up showing its whole metadata line again, truncated.
 */
export function headerMetaSlotWidth(
  headerRowWidth: number,
  brandWidth: number,
  actionsWidth: number,
): number | null {
  if (headerRowWidth <= 0) {
    return null
  }
  return Math.max(0, Math.floor(headerRowWidth - brandWidth - actionsWidth - 2 * HEADER_ROW_GAP_PX))
}
