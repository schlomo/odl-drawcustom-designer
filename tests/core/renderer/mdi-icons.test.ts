import { describe, expect, it } from 'vitest'
import {
  isKnownMdiIconName,
  mdiExportName,
  normalizeMdiIconName,
  resolveMdiPath,
} from '../../../src/core/renderer/mdi-icons'

describe('mdi-icons', () => {
  it('normalizes mdi: prefix and casing', () => {
    expect(normalizeMdiIconName('mdi:Account-Cowboy-Hat')).toBe('account-cowboy-hat')
  })

  it('maps kebab-case to mdi export name', () => {
    expect(mdiExportName('account-cowboy-hat')).toBe('mdiAccountCowboyHat')
  })

  it('resolves a known icon name to a non-empty path', () => {
    const path = resolveMdiPath('home')
    expect(path).toBeTruthy()
    expect(path!.length).toBeGreaterThan(10)
  })

  it('resolves mdi: prefixed names', () => {
    expect(resolveMdiPath('mdi:home')).toBe(resolveMdiPath('home'))
  })

  it('returns null for unknown icon names', () => {
    expect(resolveMdiPath('not-a-real-mdi-icon')).toBeNull()
  })

  it('reports known icon names', () => {
    expect(isKnownMdiIconName('home')).toBe(true)
    expect(isKnownMdiIconName('not-a-real-mdi-icon')).toBe(false)
  })
})
