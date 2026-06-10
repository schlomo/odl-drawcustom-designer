import { describe, expect, it } from 'vitest'
import {
  resolvePreviewClockInterval,
  templateNeedsSecondPrecision,
  templateUsesNow,
} from '../../../src/core/templates/preview-clock'

describe('preview clock interval', () => {
  it('detects now() usage in template strings', () => {
    expect(templateUsesNow("{{ now().strftime('%H:%M') }}")).toBe(true)
    expect(templateUsesNow("{{ states('sensor.a') }}")).toBe(false)
  })

  it('classifies second-level now templates', () => {
    expect(templateNeedsSecondPrecision("{{ (now().strftime('%S')/60*100) | round(0) }}")).toBe(
      true,
    )
    expect(templateUsesNow("{{ now().strftime('%H:%M') }}")).toBe(true)
    expect(templateNeedsSecondPrecision("{{ now().strftime('%H:%M') }}")).toBe(false)
  })

  it('returns off when payload has no now() templates', () => {
    expect(
      resolvePreviewClockInterval([
        {
          type: 'text',
          value: "{{ states('sensor.temp') }}",
          x: 0,
        },
      ]),
    ).toBe('off')
  })

  it('returns minute for clock text without seconds', () => {
    expect(
      resolvePreviewClockInterval([
        {
          type: 'text',
          value: "{{ now().strftime('%H:%M') }}",
          x: 0,
        },
      ]),
    ).toBe('minute')
  })

  it('returns second when any field needs second precision', () => {
    expect(
      resolvePreviewClockInterval([
        {
          type: 'text',
          value: "{{ now().strftime('%H:%M') }}",
          x: 0,
        },
        {
          type: 'progress_bar',
          x_start: 0,
          y_start: 0,
          x_end: 100,
          y_end: 20,
          progress: "{{ (now().strftime('%S')/60*100) | round(0) }}",
        },
      ]),
    ).toBe('second')
  })
})
