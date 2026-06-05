import { describe, expect, it } from 'vitest'
import {
  nextThemeMode,
  resolveThemeMode,
  themeModeLabel,
} from '../../../src/ui/preferences/theme'
import {
  clampYamlFontSize,
  stepYamlFontSize,
} from '../../../src/ui/preferences/yamlFontSize'

describe('theme preferences', () => {
  it('resolves system mode from OS preference', () => {
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })

  it('cycles system → light → dark → system', () => {
    expect(nextThemeMode('system')).toBe('light')
    expect(nextThemeMode('light')).toBe('dark')
    expect(nextThemeMode('dark')).toBe('system')
  })

  it('labels modes for the toggle', () => {
    expect(themeModeLabel('system')).toBe('System')
    expect(themeModeLabel('light')).toBe('Light')
    expect(themeModeLabel('dark')).toBe('Dark')
  })
})

describe('yaml font size preferences', () => {
  it('clamps font size to supported bounds', () => {
    expect(clampYamlFontSize(4)).toBe(10)
    expect(clampYamlFontSize(30)).toBe(24)
    expect(clampYamlFontSize(13.6)).toBe(14)
  })

  it('steps font size independently', () => {
    expect(stepYamlFontSize(13, 1)).toBe(14)
    expect(stepYamlFontSize(10, -1)).toBe(10)
  })
})
