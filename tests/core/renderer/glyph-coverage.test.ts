import { describe, expect, it } from 'vitest'
import {
  findMissingCharacters,
  formatMissingCharacterSample,
  scanGlyphCoverageIssues,
} from '../../../src/core/renderer/glyph-coverage'
import { loadBundledTestFont } from './font-test-utils'

describe('glyph coverage', () => {
  it('finds Hebrew letters missing from rbm.ttf', () => {
    const font = loadBundledTestFont('rbm.ttf')
    const missing = findMissingCharacters(font, 'י״ז ח׳ חשוון')
    expect(missing).toContain('י')
    expect(missing).toContain('ח')
    expect(missing).not.toContain(' ')
  })

  it('reports no gaps for ASCII in rbm.ttf', () => {
    const font = loadBundledTestFont('rbm.ttf')
    expect(findMissingCharacters(font, 'Hello 42°C')).toEqual([])
  })

  it('formats a readable sample of missing characters', () => {
    expect(formatMissingCharacterSample(['י', 'ח', 'ש', 'ו', 'ן', 'ה', 'ו'])).toBe('י, ח, ש, ו, ן, …')
  })

  it('scans text elements against loaded fonts', () => {
    loadBundledTestFont('rbm.ttf')
    const issues = scanGlyphCoverageIssues([
      {
        type: 'text',
        value: 'י״ז ח׳ חשוון',
        font: 'rbm.ttf',
        x: 10,
        y: 20,
      },
      {
        type: 'text',
        value: '21 °C',
        font: 'rbm.ttf',
        x: 0,
        y: 0,
      },
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      fontKey: 'rbm.ttf',
      elementIndex: 0,
      elementType: 'text',
    })
    expect(issues[0]?.missingCharacters.length).toBeGreaterThan(0)
  })
})
