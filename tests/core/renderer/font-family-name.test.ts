import { describe, expect, it } from 'vitest'
import { fontFamilyNameForKey } from '../../../src/core/renderer/font-family-name'

describe('fontFamilyNameForKey', () => {
  it('builds stable css family names from yaml keys', () => {
    expect(fontFamilyNameForKey('ppb.ttf')).toBe('drawcustom-font-ppb-ttf')
    expect(fontFamilyNameForKey('Times New Roman.ttf')).toBe('drawcustom-font-Times-New-Roman-ttf')
  })
})
