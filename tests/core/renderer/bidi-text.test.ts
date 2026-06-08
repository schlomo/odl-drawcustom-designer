import { describe, expect, it } from 'vitest'
import { getDominantTextDirection, toVisualText } from '../../../src/core/renderer/bidi-text'

describe('bidi text', () => {
  it('reorders Hebrew to visual left-to-right', () => {
    expect(toVisualText('כ"ג סיון')).toBe('ןויס ג"כ')
  })

  it('keeps Latin unchanged', () => {
    expect(toVisualText('17 °C')).toBe('17 °C')
  })

  it('reorders mixed LTR and RTL segments', () => {
    expect(toVisualText('ABCאבגDEF')).toBe('ABCגבאDEF')
    expect(toVisualText('כ"ג 17')).toBe('17 ג"כ')
  })

  it('detects paragraph direction', () => {
    expect(getDominantTextDirection('כ"ג סיון')).toBe('rtl')
    expect(getDominantTextDirection('17 °C')).toBe('ltr')
  })
})
