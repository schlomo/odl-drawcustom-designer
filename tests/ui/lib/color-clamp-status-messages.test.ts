import { describe, expect, it } from 'vitest'
import {
  colorNameHasClampLoss,
  elementHasColorClampLoss,
  getColorClampStatusMessage,
  scanColorClampAffectedElements,
} from '../../../src/ui/lib/color-clamp-status-messages'

describe('getColorClampStatusMessage', () => {
  it('uses a fixed message when unsupported colors are present', () => {
    const message = getColorClampStatusMessage(
      [
        {
          type: 'progress_bar',
          x_start: 0,
          y_start: 0,
          x_end: 100,
          y_end: 20,
          progress: 50,
          fill: 'yellow',
        },
      ],
      'bwr',
    )

    expect(message).toEqual({
      severity: 'warning',
      title: "Color mode doesn't support all colors used",
      summary: "Color mode doesn't support all colors used",
    })
    expect(message?.summary).not.toMatch(/element|preview|yellow|grey|#/i)
  })

  it('returns null when colors match the tag palette', () => {
    expect(
      getColorClampStatusMessage(
        [{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'red' }],
        'bwr',
      ),
    ).toBeNull()
  })

  it('returns null in rgb preview mode', () => {
    expect(
      getColorClampStatusMessage(
        [{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'yellow' }],
        'rgb',
      ),
    ).toBeNull()
  })

  it('does not warn for accent or half_accent on chromatic tag modes', () => {
    const accentCircle = [{ type: 'circle' as const, x: 0, y: 0, radius: 5, fill: 'accent' }]
    const halfAccentCircle = [
      { type: 'circle' as const, x: 0, y: 0, radius: 5, fill: 'half_accent' },
    ]

    for (const mode of ['bwr', 'bwy', 'four', 'six'] as const) {
      expect(getColorClampStatusMessage(accentCircle, mode)).toBeNull()
      expect(getColorClampStatusMessage(halfAccentCircle, mode)).toBeNull()
      expect(colorNameHasClampLoss('half_accent', mode)).toBe(false)
    }
  })

  it('warns for accent and half_accent on BW because the tag has no accent color', () => {
    expect(
      getColorClampStatusMessage(
        [{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'accent' }],
        'bw',
      ),
    ).toMatchObject({
      severity: 'warning',
      title: "Color mode doesn't support all colors used",
    })
    expect(
      getColorClampStatusMessage(
        [{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'half_accent' }],
        'bw',
      ),
    ).toMatchObject({ severity: 'warning' })
  })
})

describe('colorNameHasClampLoss', () => {
  it('ignores accent ink outside BW mode', () => {
    expect(colorNameHasClampLoss('accent', 'bwr')).toBe(false)
    expect(colorNameHasClampLoss('half_accent', 'four')).toBe(false)
    expect(colorNameHasClampLoss('half_accent', 'six')).toBe(false)
    expect(colorNameHasClampLoss('accent', 'bw')).toBe(true)
    expect(colorNameHasClampLoss('half_accent', 'bw')).toBe(true)
  })
})

describe('scanColorClampAffectedElements', () => {
  it('flags elements with clamped plot series colors', () => {
    const elements = [
      { type: 'text' as const, value: 'Hi', x: 0, y: 0 },
      {
        type: 'plot' as const,
        data: [{ entity: 'sensor.temp', color: 'yellow', width: 1 }],
      },
    ]

    expect(scanColorClampAffectedElements(elements, 'bwr')).toEqual([1])
    expect(elementHasColorClampLoss(elements[1]!, 'bwr')).toBe(true)
    expect(elementHasColorClampLoss(elements[0]!, 'bwr')).toBe(false)
  })
})
