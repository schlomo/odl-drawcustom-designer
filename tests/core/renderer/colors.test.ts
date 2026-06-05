import { describe, expect, it } from 'vitest'
import { mapColor } from '../../../src/core/renderer/colors'

describe('mapColor', () => {
  it('maps base palette colors', () => {
    expect(mapColor('white')).toBe('#FFFFFF')
    expect(mapColor('black')).toBe('#000000')
    expect(mapColor('red')).toBe('#FF0000')
    expect(mapColor('yellow')).toBe('#FFFF00')
  })

  it('maps single-letter shortcuts', () => {
    expect(mapColor('w')).toBe('#FFFFFF')
    expect(mapColor('b')).toBe('#000000')
    expect(mapColor('r')).toBe('#FF0000')
    expect(mapColor('y')).toBe('#FFFF00')
  })

  it('maps accent to red tag by default', () => {
    expect(mapColor('accent')).toBe('#FF0000')
    expect(mapColor('a')).toBe('#FF0000')
  })

  it('maps accent to yellow tag when accentMode is yellow', () => {
    expect(mapColor('accent', { accentMode: 'yellow' })).toBe('#FFFF00')
    expect(mapColor('a', { accentMode: 'yellow' })).toBe('#FFFF00')
  })

  it('maps halftone aliases and shortcuts', () => {
    expect(mapColor('half_black')).toBe('#808080')
    expect(mapColor('gray')).toBe('#808080')
    expect(mapColor('grey')).toBe('#808080')
    expect(mapColor('hb')).toBe('#808080')
    expect(mapColor('half_white')).toBe('#BFBFBF')
    expect(mapColor('hw')).toBe('#BFBFBF')
    expect(mapColor('half_red')).toBe('#FF8080')
    expect(mapColor('hr')).toBe('#FF8080')
    expect(mapColor('half_yellow')).toBe('#FFFF80')
    expect(mapColor('hy')).toBe('#FFFF80')
  })

  it('maps half_accent from accent mode', () => {
    expect(mapColor('half_accent')).toBe('#FF8080')
    expect(mapColor('ha')).toBe('#FF8080')
    expect(mapColor('half_accent', { accentMode: 'yellow' })).toBe('#FFFF80')
  })

  it('expands 3-digit hex colors', () => {
    expect(mapColor('#F00')).toBe('#FF0000')
    expect(mapColor('#0f0')).toBe('#00FF00')
  })

  it('normalizes 6-digit hex colors', () => {
    expect(mapColor('#FF0000')).toBe('#FF0000')
    expect(mapColor('#ff00ff')).toBe('#FF00FF')
  })

  it('returns null for none and null', () => {
    expect(mapColor('none')).toBeNull()
    expect(mapColor(null)).toBeNull()
    expect(mapColor(undefined)).toBeNull()
  })
})
