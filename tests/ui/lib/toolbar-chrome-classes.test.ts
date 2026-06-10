import { describe, expect, it } from 'vitest'
import {
  floatingToolbarShell,
  toolbarGroupRow,
  toolbarGroupsRow,
} from '../../../src/ui/lib/export-action-feedback'

describe('toolbar chrome classes (ADR-014)', () => {
  it('keeps panel toolbars on a single row', () => {
    expect(toolbarGroupsRow).toContain('flex-nowrap')
    expect(toolbarGroupsRow).toContain('overflow-visible')
    expect(toolbarGroupsRow).not.toContain('flex-wrap')
    expect(toolbarGroupRow).toContain('flex-nowrap')
  })

  it('limits the multi-select floater to 90% width', () => {
    expect(floatingToolbarShell).toContain('max-w-[90%]')
    expect(floatingToolbarShell).toContain('flex-nowrap')
    expect(floatingToolbarShell).toContain('overflow-visible')
  })
})
