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

  it('matches destructive text and icon palettes', () => {
    expect(shell.buttonDestructive).toContain('--shell-danger')
    expect(shell.buttonDestructiveIcon).toContain('--shell-danger-border')
    expect(shell.buttonDestructiveIcon).toContain('--shell-danger-hover')
  })
})
