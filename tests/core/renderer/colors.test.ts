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
    expect(mapColor('accent', { colorMode: 'bwy' })).toBe('#FFFF00')
    expect(mapColor('a', { colorMode: 'bwy' })).toBe('#FFFF00')
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
    expect(mapColor('half_accent', { colorMode: 'bwy' })).toBe('#FFFF80')
  })

  it('expands and clamps 3-digit hex colors to the active palette', () => {
    expect(mapColor('#F00')).toBe('#FF0000')
    expect(mapColor('#0f0')).toBe('#808080')
  })

  it('normalizes 6-digit hex colors to the nearest tag palette entry', () => {
    expect(mapColor('#FF0000')).toBe('#FF0000')
    expect(mapColor('#ff00ff')).toBe('#FF8080')
  })

  it('returns null for none and null', () => {
    expect(mapColor('none')).toBeNull()
    expect(mapColor(null)).toBeNull()
    expect(mapColor(undefined)).toBeNull()
  })

  it('maps accent colors to monochrome in BW mode', () => {
    expect(mapColor('red', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('yellow', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('accent', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('half_accent', { colorMode: 'bw' })).toBe('#808080')
    expect(mapColor('half_red', { colorMode: 'bw' })).toBe('#808080')
    expect(mapColor('white', { colorMode: 'bw' })).toBe('#FFFFFF')
    expect(mapColor('black', { colorMode: 'bw' })).toBe('#000000')
  })

  it('renders both accent colors in 4-color (ODL BWRY) mode', () => {
    expect(mapColor('red', { colorMode: 'four' })).toBe('#FF0000')
    expect(mapColor('yellow', { colorMode: 'four' })).toBe('#FFFF00')
    expect(mapColor('accent', { colorMode: 'four' })).toBe('#FF0000')
  })

  it('passes arbitrary hex through in RGB preview mode', () => {
    expect(mapColor('#336699', { colorMode: 'rgb' })).toBe('#336699')
    expect(mapColor('#abc', { colorMode: 'rgb' })).toBe('#AABBCC')
    expect(mapColor('red', { colorMode: 'rgb' })).toBe('#FF0000')
  })

  it('clamps hex accents to the active tag palette in BW mode', () => {
    expect(mapColor('#FF0000', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('#FFFF00', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('#F8FAFC', { colorMode: 'bw' })).toBe('#FFFFFF')
  })

  it('maps blue and green named colors to their 6-color hex', () => {
    expect(mapColor('blue')).toBe('#0000FF')
    expect(mapColor('green')).toBe('#00FF00')
  })

  it('keeps blue and green unchanged in six-color mode', () => {
    expect(mapColor('blue', { colorMode: 'six' })).toBe('#0000FF')
    expect(mapColor('green', { colorMode: 'six' })).toBe('#00FF00')
  })

  it('clamps blue and green to ink in BW mode', () => {
    expect(mapColor('blue', { colorMode: 'bw' })).toBe('#000000')
    expect(mapColor('green', { colorMode: 'bw' })).toBe('#000000')
  })
})
