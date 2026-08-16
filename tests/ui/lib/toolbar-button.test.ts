import { describe, expect, it } from 'vitest'
import {
  toolbarChipActive,
  toolbarChipClassName,
  toggleButtonClassName,
} from '../../../src/ui/lib/toolbar-button'
import { shell } from '../../../src/ui/styles/shell'

describe('toolbar button chrome', () => {
  it('uses shared active styling for chips and toggles', () => {
    expect(toolbarChipClassName(true)).toContain(toolbarChipActive)
    expect(toggleButtonClassName(true)).toContain(toolbarChipActive)
  })

  it('uses neutral shell button styling when inactive', () => {
    expect(toolbarChipClassName(false)).toContain(shell.button)
    expect(toggleButtonClassName(false)).toContain(shell.button)
  })

  /**
   * Maintainer feedback on PR #135 (2026-08-16, issue #132 follow-up): the
   * canvas and YAML header toolbars (zoom chips, Invisible/Snap/Dither,
   * Preview/Linked) read as visibly lower-contrast than the top header bar
   * and sidebar rotation buttons. Root cause was an `opacity: 0.8` utility
   * layered on top of `shell.button` for the unselected branch here — a second dialect this
   * source-string tripwire pins shut. `opacity` composites the whole element
   * against whatever is behind it and does not change what `background-color`
   * computes to, so a computed-style read of the background alone (as in
   * `tests/ui/styles/shell.test.ts`) cannot see this class of regression;
   * `tests/e2e/shell-button-theme-contrast.spec.ts` reads the actual painted
   * `opacity` on a built page in both themes.
   */
  it('does not dim the unselected/off chrome below the shared neutral ramp', () => {
    expect(toolbarChipClassName(false)).not.toContain('opacity')
    expect(toggleButtonClassName(false)).not.toContain('opacity')
  })

  it('matches destructive text and icon palettes', () => {
    expect(shell.buttonDestructive).toContain('--shell-danger')
    expect(shell.buttonDestructiveIcon).toContain('--shell-danger-border')
    expect(shell.buttonDestructiveIcon).toContain('--shell-danger-hover')
  })
})
