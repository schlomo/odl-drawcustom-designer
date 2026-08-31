/**
 * Which build-metadata segments the page header shows at the current width.
 *
 * The header meta row (privacy note · GitHub · version/PR · branch · SHA) used
 * to absorb every squeeze by ellipsing its text, which produced meaningless
 * stubs (`Client-…`, `feat/si…`) while the action buttons beside it kept their
 * full labels (maintainer ruling 2026-08-31). Two rules follow from that:
 *
 * 1. A segment that cannot be shown in full is **dropped**, not truncated —
 *    a stub costs width and communicates nothing. Dropped means removed from
 *    the DOM (never `visibility: hidden`, whose layout box widens scrollers —
 *    AGENTS.md horizontal-scrollbar bug class, PR #85).
 * 2. Segments give way in a fixed priority order: the build's *identity* (the
 *    release version / PR number, then the commit SHA) survives longest; the
 *    privacy headline goes first.
 *
 * Widths come from an off-screen probe that always renders every segment at its
 * natural width, so this decision is a pure, monotone function of the available
 * width — no hysteresis needed, because dropping a segment cannot change the
 * measurements it was derived from.
 */

/** Render order of the meta row, left to right. */
export const HEADER_META_SEGMENTS = ['privacy', 'github', 'version', 'branch', 'sha'] as const

export type HeaderMetaSegment = (typeof HEADER_META_SEGMENTS)[number]

/**
 * Order segments are given up in as the row narrows — first entry goes first.
 *
 * `version` (the release tag on production, the `PR #n` on a preview build) is
 * last: it is the identity of the build the user is looking at and must stay
 * fully visible for as long as the meta row shows anything at all. `branch`
 * goes before `sha` because the SHA is what makes a build reproducible while
 * the branch name is already implied by the PR number.
 */
export const HEADER_META_DROP_ORDER: readonly HeaderMetaSegment[] = [
  'privacy',
  'github',
  'branch',
  'sha',
  'version',
]

export interface HeaderMetaFitInput {
  /** Width the live meta column may occupy; `null` means "not measured yet". */
  availableWidth: number | null
  /** Natural width of each rendered segment, measured off-screen. */
  segmentWidths: Partial<Record<HeaderMetaSegment, number>>
  /** Natural width of one ` · ` separator. */
  separatorWidth: number
}

/** Total width of a segment set, including the separators between them. */
export function headerMetaSegmentsWidth(
  segments: readonly HeaderMetaSegment[],
  segmentWidths: Partial<Record<HeaderMetaSegment, number>>,
  separatorWidth: number,
): number {
  if (segments.length === 0) {
    return 0
  }
  const content = segments.reduce((total, segment) => total + (segmentWidths[segment] ?? 0), 0)
  return content + (segments.length - 1) * separatorWidth
}

/**
 * Largest set of rendered segments that fits `availableWidth`, dropping in
 * {@link HEADER_META_DROP_ORDER}. Returned in {@link HEADER_META_SEGMENTS}
 * render order.
 *
 * Before anything has been measured (no probe widths yet, or a `null` slot —
 * jsdom, first paint) every rendered segment is kept: hiding build metadata on
 * the strength of a measurement that has not happened would be a worse default
 * than one transient wide frame. A measured slot of `0`, by contrast, means
 * there is no room at all and everything goes.
 */
export function resolveVisibleHeaderMetaSegments(input: HeaderMetaFitInput): HeaderMetaSegment[] {
  const { availableWidth, segmentWidths, separatorWidth } = input
  const rendered = HEADER_META_SEGMENTS.filter((segment) => segmentWidths[segment] != null)

  if (rendered.length === 0 || availableWidth == null) {
    return [...rendered]
  }

  let kept = rendered
  for (const candidate of HEADER_META_DROP_ORDER) {
    if (headerMetaSegmentsWidth(kept, segmentWidths, separatorWidth) <= availableWidth) {
      return kept
    }
    kept = kept.filter((segment) => segment !== candidate)
  }

  return headerMetaSegmentsWidth(kept, segmentWidths, separatorWidth) <= availableWidth ? kept : []
}
