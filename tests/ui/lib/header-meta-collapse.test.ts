import { describe, expect, it } from 'vitest'
import {
  headerMetaSlotWidth,
  headerProbeSlotWidth,
} from '../../../src/ui/lib/header-chrome-layout'
import {
  resolveVisibleHeaderMetaSegments,
  type HeaderMetaSegment,
} from '../../../src/ui/lib/header-meta-collapse'

/**
 * Measured widths of a PR-preview header meta row, read off the real build in
 * Chromium at 1400px (see the PR body's before/after table):
 * `Client-only …` 154, `GitHub` 40, `PR #173` 51, `feat/…` 116, `a1b2c3d` 51,
 * with an 8px ` · ` separator between neighbours.
 */
const PREVIEW_WIDTHS: Partial<Record<HeaderMetaSegment, number>> = {
  privacy: 154,
  github: 40,
  version: 51,
  branch: 116,
  sha: 51,
}

/** Production shape: no branch segment, `v2.7.0` in the version slot. */
const PRODUCTION_WIDTHS: Partial<Record<HeaderMetaSegment, number>> = {
  privacy: 154,
  github: 40,
  version: 47,
  sha: 51,
}

const SEPARATOR = 8

function visibleAt(
  availableWidth: number | null,
  segmentWidths = PREVIEW_WIDTHS,
): HeaderMetaSegment[] {
  return resolveVisibleHeaderMetaSegments({
    availableWidth,
    segmentWidths,
    separatorWidth: SEPARATOR,
  })
}

describe('header meta row shrink priority', () => {
  it('shows every segment when the row has room for all of them', () => {
    expect(visibleAt(444)).toEqual(['privacy', 'github', 'version', 'branch', 'sha'])
  })

  it('drops the privacy headline first rather than ellipsing it to a stub', () => {
    // 444 needed for everything; 400 is enough for all but the privacy note.
    expect(visibleAt(400)).toEqual(['github', 'version', 'branch', 'sha'])
  })

  it('gives up the GitHub link before the build identity', () => {
    expect(visibleAt(260)).toEqual(['version', 'branch', 'sha'])
  })

  it('gives up the branch name before the commit SHA', () => {
    expect(visibleAt(150)).toEqual(['version', 'sha'])
  })

  it('keeps the PR number visible as long as anything at all is shown', () => {
    for (const width of [444, 400, 300, 260, 200, 150, 110, 60, 51]) {
      const visible = visibleAt(width)
      if (visible.length > 0) {
        expect(visible, `width ${width}`).toContain('version')
      }
    }
  })

  it('shows nothing rather than a stub once even the build identity cannot fit', () => {
    expect(visibleAt(20)).toEqual([])
    expect(visibleAt(0)).toEqual([])
  })

  it('keeps the production `v{version}` shape intact under the same priority', () => {
    expect(visibleAt(316, PRODUCTION_WIDTHS)).toEqual(['privacy', 'github', 'version', 'sha'])
    expect(visibleAt(154, PRODUCTION_WIDTHS)).toEqual(['github', 'version', 'sha'])
    expect(visibleAt(110, PRODUCTION_WIDTHS)).toEqual(['version', 'sha'])
    expect(visibleAt(50, PRODUCTION_WIDTHS)).toEqual(['version'])
  })

  it('keeps everything while the header has not been measured yet', () => {
    // jsdom and the first frame report no layout. Hiding build metadata on a
    // measurement that never happened is worse than one wide frame — but a
    // *measured* zero-width slot (above) really does mean "no room".
    expect(visibleAt(null)).toEqual(['privacy', 'github', 'version', 'branch', 'sha'])
  })
})

describe('header slot arithmetic', () => {
  it('reserves the meta row its natural width when sizing the action probe', () => {
    // Header row 1052 wide (1100 viewport minus px-6), brand block 312.
    expect(headerProbeSlotWidth(1052, 312)).toBe(724)
  })

  it('reports an unmeasured header as null, not as a zero-width meta slot', () => {
    expect(headerMetaSlotWidth(0, 0, 0)).toBeNull()
    expect(headerProbeSlotWidth(0, 312)).toBe(0)
  })

  it('subtracts both row gaps from the meta slot', () => {
    // 852 row − 312 brand − 136 collapsed toolbar − 2 × gap-4.
    expect(headerMetaSlotWidth(852, 312, 136)).toBe(372)
  })

  it('never reports a negative meta slot', () => {
    expect(headerMetaSlotWidth(452, 312, 136)).toBe(0)
  })
})
