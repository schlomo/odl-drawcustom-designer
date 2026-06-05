/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  collectFontKeysFromElements,
  fontFamilyNameForKey,
  resolveCanvasFontFamily,
} from '../../../src/ui/lib/load-font-faces'

describe('load-font-faces helpers', () => {
  it('builds stable css family names from yaml keys', () => {
    expect(fontFamilyNameForKey('ppb.ttf')).toBe('oepl-font-ppb-ttf')
    expect(fontFamilyNameForKey('/local/logo.png')).toBe('oepl-font-local-logo-png')
  })

  it('collects non-template font keys from elements', () => {
    expect(
      collectFontKeysFromElements([
        {
          type: 'text',
          value: 'Hi',
          font: 'ppb.ttf',
          x: 0,
          y: 0,
        },
        {
          type: 'text',
          value: '{{ states("sensor.x") }}',
          font: "{{ states('sensor.font') }}",
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['ppb.ttf'])
  })

  it('resolves canvas font family with fallback', () => {
    const families = new Map([['ppb.ttf', 'oepl-font-ppb-ttf']])
    expect(resolveCanvasFontFamily('ppb.ttf', families)).toBe('oepl-font-ppb-ttf')
    expect(resolveCanvasFontFamily('missing.ttf', families)).toBe('sans-serif')
    expect(resolveCanvasFontFamily(undefined, families)).toBe('sans-serif')
  })
})
