/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { resetContentMap } from '../../../src/core'
import {
  clearFontFamilyCacheForTests,
  collectFontKeysFromElements,
  fontFamilyNameForKey,
  resolveCanvasFontFamily,
} from '../../../src/ui/lib/load-font-faces'

describe('load-font-faces helpers', () => {
  afterEach(() => {
    resetContentMap()
    clearFontFamilyCacheForTests()
  })

  it('builds stable css family names from yaml keys', () => {
    expect(fontFamilyNameForKey('ppb.ttf')).toBe('drawcustom-font-ppb-ttf')
    expect(fontFamilyNameForKey('/local/logo.png')).toBe('drawcustom-font-local-logo-png')
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

  it('includes default font when text omits font field', () => {
    expect(
      collectFontKeysFromElements([
        {
          type: 'text',
          value: 'Hi',
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['ppb.ttf'])
  })

  it('resolves canvas font family with fallback', () => {
    const families = new Map([['ppb.ttf', 'drawcustom-font-ppb-ttf']])
    expect(resolveCanvasFontFamily('ppb.ttf', families)).toBe('drawcustom-font-ppb-ttf')
    expect(resolveCanvasFontFamily('missing.ttf', families)).toBe('sans-serif')
    expect(resolveCanvasFontFamily(undefined, families)).toBe('sans-serif')
  })

})
