import { describe, expect, it } from 'vitest'
import {
  collectRequiredFontKeys,
  collectTemplatedFontKeys,
} from '../../../src/core/assets/font-requirements'

describe('font requirements', () => {
  it('includes default ppb.ttf when text omits font', () => {
    expect(
      collectRequiredFontKeys([
        {
          type: 'text',
          value: 'Hello',
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['ppb.ttf'])
  })

  it('separates templated font keys from static requirements', () => {
    const elements = [
      {
        type: 'text' as const,
        value: 'Hi',
        font: 'ppb.ttf',
        x: 0,
        y: 0,
      },
      {
        type: 'text' as const,
        value: '{{ x }}',
        font: "{{ states('sensor.font') }}",
        x: 0,
        y: 0,
      },
    ]

    expect(collectRequiredFontKeys(elements)).toEqual(['ppb.ttf'])
    expect(collectTemplatedFontKeys(elements)).toEqual(["{{ states('sensor.font') }}"])
  })
})
