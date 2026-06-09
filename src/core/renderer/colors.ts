import { clampHexToColorMode } from '../display/palette-clamp'
import {
  resolveAccentMode,
  resolveColorMode,
  type TagColorMode,
} from '../display/palette'
import type { ColorOptions } from './types'

type ColorInput = string | null | undefined

const BASE_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  yellow: '#FFFF00',
  w: '#FFFFFF',
  b: '#000000',
  r: '#FF0000',
  y: '#FFFF00',
  half_black: '#808080',
  gray: '#808080',
  grey: '#808080',
  hb: '#808080',
  half_white: '#BFBFBF',
  hw: '#BFBFBF',
  half_red: '#FF8080',
  hr: '#FF8080',
  half_yellow: '#FFFF80',
  hy: '#FFFF80',
}

const BW_ACCENT_COLOR_NAMES = new Set([
  'red',
  'r',
  'yellow',
  'y',
  'accent',
  'a',
  'half_red',
  'hr',
  'half_yellow',
  'hy',
  'half_accent',
  'ha',
])

const BW_HALF_TONE_NAMES = new Set([
  'half_red',
  'hr',
  'half_yellow',
  'hy',
  'half_accent',
  'ha',
  'half_black',
  'gray',
  'grey',
  'hb',
  'half_white',
  'hw',
])

function accentColor(accentMode: 'red' | 'yellow'): string {
  return accentMode === 'yellow' ? '#FFFF00' : '#FF0000'
}

function halfAccentColor(accentMode: 'red' | 'yellow'): string {
  return accentMode === 'yellow' ? '#FFFF80' : '#FF8080'
}

function expandHex(hex: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    const [, r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return hex.toUpperCase()
}

function applyBwMonochrome(colorName: string, hex: string): string {
  if (BW_HALF_TONE_NAMES.has(colorName)) {
    return '#808080'
  }
  if (BW_ACCENT_COLOR_NAMES.has(colorName)) {
    return '#000000'
  }
  return hex
}

function applyColorMode(colorName: string, hex: string, colorMode: TagColorMode): string {
  if (colorMode === 'bw') {
    return applyBwMonochrome(colorName, hex)
  }
  // four, bwr, bwy, six, rgb — named palette colors pass through unchanged
  return hex
}

export function mapColor(color: ColorInput, options: ColorOptions = {}): string | null {
  if (color == null || color === 'none') {
    return null
  }

  const colorMode = resolveColorMode(options)
  const accentMode = resolveAccentMode(options)

  if (color === 'accent' || color === 'a') {
    return applyColorMode(color, accentColor(accentMode), colorMode)
  }

  if (color === 'half_accent' || color === 'ha') {
    return applyColorMode(color, halfAccentColor(accentMode), colorMode)
  }

  const base = BASE_COLORS[color]
  if (base) {
    return applyColorMode(color, base, colorMode)
  }

  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(color)) {
    const expanded = expandHex(color)
    if (colorMode === 'rgb' || colorMode === 'six') {
      return expanded
    }
    return clampHexToColorMode(expanded, colorMode)
  }

  // rgb / six: unknown names pass through for designer preview
  if (colorMode === 'rgb' || colorMode === 'six') {
    return color
  }

  return color
}
