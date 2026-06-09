/** Delay before a toolbar hover tooltip appears (ms). */
export const TOOLBAR_TOOLTIP_SHOW_DELAY_MS = 300

/**
 * Resolve `title` for toolbar controls that may hide their text label (ADR-013).
 * Icon-only buttons always get the human-readable label as a tooltip.
 */
export function collapsedToolbarTooltip(
  textLabel: string,
  showTextLabel: boolean,
  detailedTitle?: string,
): string {
  if (!showTextLabel) {
    return textLabel
  }
  return detailedTitle ?? textLabel
}
