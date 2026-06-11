import { describe, expect, it, vi } from 'vitest'
import {
  applyResolutionSelectValue,
  compareResolutionPicks,
  CUSTOM_RESOLUTION_VALUE,
  DEFAULT_RESOLUTION,
  findResolutionPick,
  formatResolutionLabel,
  RESOLUTION_QUICK_PICKS,
  resolutionDropdownValue,
  resolutionSelectValue,
  shouldShowCustomResolutionInputs,
  SORTED_RESOLUTION_QUICK_PICKS,
} from '../../../src/ui/data/resolution-picks'

describe('resolution quick-picks', () => {
  it('lists common tag dimensions without inch labels', () => {
    expect(RESOLUTION_QUICK_PICKS).toHaveLength(18)
    expect(formatResolutionLabel(384, 184)).toBe('384×184')
    expect(RESOLUTION_QUICK_PICKS.some((pick) => pick.width === 880 && pick.height === 528)).toBe(true)
  })

  it('uses the default 384×184 resolution', () => {
    expect(DEFAULT_RESOLUTION).toEqual({ width: 384, height: 184 })
  })

  it('finds a quick-pick by dimensions', () => {
    expect(findResolutionPick(880, 528)).toEqual({ width: 880, height: 528 })
    expect(findResolutionPick(565, 480)).toBeNull()
  })

  it('returns custom when dimensions are not in the list', () => {
    expect(resolutionSelectValue(384, 184)).toBe('384×184')
    expect(resolutionSelectValue(565, 480)).toBe(CUSTOM_RESOLUTION_VALUE)
  })

  it('sorts quick-picks strictly by width then height', () => {
    expect(SORTED_RESOLUTION_QUICK_PICKS).toHaveLength(RESOLUTION_QUICK_PICKS.length)
    for (let index = 1; index < SORTED_RESOLUTION_QUICK_PICKS.length; index++) {
      expect(
        compareResolutionPicks(
          SORTED_RESOLUTION_QUICK_PICKS[index - 1]!,
          SORTED_RESOLUTION_QUICK_PICKS[index]!,
        ),
      ).toBeLessThanOrEqual(0)
    }
    expect(SORTED_RESOLUTION_QUICK_PICKS[0]).toEqual({ width: 152, height: 152 })
    expect(SORTED_RESOLUTION_QUICK_PICKS[1]).toEqual({ width: 168, height: 384 })
    expect(SORTED_RESOLUTION_QUICK_PICKS.at(-1)).toEqual({ width: 960, height: 672 })
  })
})

describe('resolution custom UI helpers', () => {
  it('keeps dropdown on a quick-pick until user chooses Custom', () => {
    expect(resolutionDropdownValue(384, 184, false)).toBe('384×184')
    expect(shouldShowCustomResolutionInputs(384, 184, false)).toBe(false)
  })

  it('shows Custom dropdown and W/H inputs when user selects Custom on a quick-pick size', () => {
    expect(resolutionDropdownValue(384, 184, true)).toBe(CUSTOM_RESOLUTION_VALUE)
    expect(shouldShowCustomResolutionInputs(384, 184, true)).toBe(true)
  })

  it('shows custom inputs for non-list dimensions without forcing custom mode', () => {
    expect(resolutionDropdownValue(565, 480, false)).toBe(CUSTOM_RESOLUTION_VALUE)
    expect(shouldShowCustomResolutionInputs(565, 480, false)).toBe(true)
  })

  it('selecting Custom enables editing without changing canvas size', () => {
    const setEditingCustom = vi.fn()
    const onApplyResolution = vi.fn()

    applyResolutionSelectValue(CUSTOM_RESOLUTION_VALUE, {
      setEditingCustom,
      onApplyResolution,
    })

    expect(setEditingCustom).toHaveBeenCalledWith(true)
    expect(onApplyResolution).not.toHaveBeenCalled()
  })

  it('selecting a quick-pick applies resolution and exits custom editing', () => {
    const setEditingCustom = vi.fn()
    const onApplyResolution = vi.fn()

    applyResolutionSelectValue('296×128', {
      setEditingCustom,
      onApplyResolution,
    })

    expect(setEditingCustom).toHaveBeenCalledWith(false)
    expect(onApplyResolution).toHaveBeenCalledWith(296, 128)
  })
})
