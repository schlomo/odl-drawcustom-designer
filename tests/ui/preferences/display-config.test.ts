import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPLAY_CONFIG,
  parseDisplayConfig,
  readDisplayConfig,
  writeDisplayConfig,
} from '../../../src/ui/preferences/displayConfig'
import { DISPLAY_CONFIG_STORAGE_KEY } from '../../../src/ui/preferences/keys'

describe('display config preferences', () => {
  afterEach(() => {
    localStorage.removeItem(DISPLAY_CONFIG_STORAGE_KEY)
  })

  it('returns defaults when storage is empty', () => {
    expect(readDisplayConfig()).toEqual(DEFAULT_DISPLAY_CONFIG)
  })

  it('round-trips display config through localStorage', () => {
    writeDisplayConfig({
      width: 880,
      height: 528,
      rotation: 90,
      accentMode: 'yellow',
      previewDitherMode: 2,
    })

    expect(readDisplayConfig()).toEqual({
      width: 880,
      height: 528,
      rotation: 90,
      accentMode: 'yellow',
      previewDitherMode: 2,
    })
  })

  it('rejects invalid stored values', () => {
    expect(parseDisplayConfig({ width: 0, height: 100, rotation: 0, accentMode: 'red' })).toBeNull()
    expect(parseDisplayConfig({ width: 100, height: 100, rotation: 45, accentMode: 'red' })).toBeNull()
    expect(parseDisplayConfig({ width: 100, height: 100, rotation: 0, accentMode: 'blue' })).toBeNull()
  })

  it('falls back to defaults for corrupt JSON', () => {
    localStorage.setItem(DISPLAY_CONFIG_STORAGE_KEY, '{not json')
    expect(readDisplayConfig()).toEqual(DEFAULT_DISPLAY_CONFIG)
  })
})
