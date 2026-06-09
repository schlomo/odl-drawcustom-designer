import { describe, expect, it } from 'vitest'
import { getColorPreviewClampInfo } from '../../../src/core/renderer/preview-paint'

describe('getColorPreviewClampInfo', () => {
  it('detects wrong-accent yellow on BWR', () => {
    expect(getColorPreviewClampInfo('yellow', { colorMode: 'bwr' })).toMatchObject({
      yamlHex: '#FFFF00',
      tagHex: '#808080',
      lost: true,
    })
  })

  it('detects wrong-accent red on BWY', () => {
    expect(getColorPreviewClampInfo('red', { colorMode: 'bwy' })).toMatchObject({
      yamlHex: '#FF0000',
      tagHex: '#808080',
      lost: true,
    })
  })

  it('reports no loss for palette-native accent colors', () => {
    expect(getColorPreviewClampInfo('red', { colorMode: 'bwr' })?.lost).toBe(false)
    expect(getColorPreviewClampInfo('yellow', { colorMode: 'bwy' })?.lost).toBe(false)
    expect(getColorPreviewClampInfo('accent', { colorMode: 'bwr' })?.lost).toBe(false)
  })

  it('ignores none, templates, and rgb preview mode', () => {
    expect(getColorPreviewClampInfo('none', { colorMode: 'bwr' })).toBeNull()
    expect(getColorPreviewClampInfo("{{ 'yellow' }}", { colorMode: 'bwr' })).toBeNull()
    expect(getColorPreviewClampInfo('yellow', { colorMode: 'rgb' })).toBeNull()
  })
})
