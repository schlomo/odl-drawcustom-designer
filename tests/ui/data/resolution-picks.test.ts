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
    expect(RESOLUTION_QUICK_PICKS).toHaveLength(17)
    expect(formatResolutionLabel(384, 184)).toBe('384×184')
    expect(RESOLUTION_QUICK_PICKS.some((pick) => pick.width === 880 && pick.height === 528)).toBe(true)
  })

  it('lists each panel once — a pick is a pair of dimensions, not an orientation', () => {
    // The orientation control owns which way round a panel goes (issue #139),
    // so the same pair must never appear twice in the menu: two entries that
    // mean one display would leave one of them permanently unhighlightable.
    const pairs = RESOLUTION_QUICK_PICKS.map((pick) =>
      [pick.width, pick.height].sort((a, b) => a - b).join('×'),
    )
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('uses the default 384×184 resolution', () => {
    expect(DEFAULT_RESOLUTION).toEqual({ width: 384, height: 184 })
  })

  it('finds a quick-pick by dimensions, either way round', () => {
    expect(findResolutionPick(880, 528)).toEqual({ width: 880, height: 528 })
    expect(findResolutionPick(528, 880)).toEqual({ width: 880, height: 528 })
    expect(findResolutionPick(565, 480)).toBeNull()
  })

  it('a turned panel still reads as its quick-pick, never as Custom', () => {
    // Issue #139 F3: the orientation control is the sole owner of orientation,
    // so turning a 296×128 display must not make the resolution control claim
    // the user invented a custom size.
    expect(resolutionSelectValue(384, 184)).toBe('384×184')
    expect(resolutionSelectValue(128, 296)).toBe('296×128')
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
    expect(SORTED_RESOLUTION_QUICK_PICKS[1]).toEqual({ width: 200, height: 200 })
    expect(SORTED_RESOLUTION_QUICK_PICKS.at(-1)).toEqual({ width: 960, height: 672 })
  })
})

describe('resolution custom UI helpers', () => {
  it('keeps dropdown on a quick-pick until user chooses Custom', () => {
    expect(resolutionDropdownValue(384, 184, false)).toBe('384×184')
    expect(shouldShowCustomResolutionInputs(384, 184, false)).toBe(false)
  })

  it('keeps the dropdown on the quick-pick — and the W/H inputs hidden — while turned', () => {
    expect(resolutionDropdownValue(128, 296, false)).toBe('296×128')
    expect(shouldShowCustomResolutionInputs(128, 296, false)).toBe(false)
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
    const onCanvasSizeChange = vi.fn()

    applyResolutionSelectValue(CUSTOM_RESOLUTION_VALUE, {
      setEditingCustom,
      rotation: 0,
      onCanvasSizeChange,
    })

    expect(setEditingCustom).toHaveBeenCalledWith(true)
    expect(onCanvasSizeChange).not.toHaveBeenCalled()
  })

  it('selecting a quick-pick applies resolution and exits custom editing', () => {
    const setEditingCustom = vi.fn()
    const onCanvasSizeChange = vi.fn()

    applyResolutionSelectValue('296×128', {
      setEditingCustom,
      rotation: 0,
      onCanvasSizeChange,
    })

    expect(setEditingCustom).toHaveBeenCalledWith(false)
    expect(onCanvasSizeChange).toHaveBeenCalledWith(296, 128)
  })

  it('a quick-pick lands in the orientation the canvas is held in', () => {
    // Issue #139 F3: picking a display's dimensions is not a statement about
    // orientation — that stays with the orientation control. Picking 296×128
    // while holding the canvas at 90° gives the panel turned: 128×296.
    const applyAt = (rotation: 0 | 90 | 180 | 270) => {
      const onCanvasSizeChange = vi.fn()
      applyResolutionSelectValue('296×128', {
        setEditingCustom: vi.fn(),
        rotation,
        onCanvasSizeChange,
      })
      return onCanvasSizeChange.mock.calls[0]
    }

    expect(applyAt(0)).toEqual([296, 128])
    expect(applyAt(180)).toEqual([296, 128])
    expect(applyAt(90)).toEqual([128, 296])
    expect(applyAt(270)).toEqual([128, 296])
  })
})
