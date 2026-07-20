import { clampHexToColorMode } from '../display/palette-clamp'
import {
  resolveAccentMode,
  resolveColorMode,
  type TagColorMode,
} from '../display/palette'
import {
  halfToneHex,
  paletteBaseHex,
  type HalfToneName,
  type PaletteColorName,
  type PaletteOverrides,
} from '../display/palette-overrides'
import type { ColorOptions } from './types'

type ColorInput = string | null | undefined

const BASE_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  yellow: '#FFFF00',
  blue: '#0000FF',
  green: '#00FF00',
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

const NAME_TO_PALETTE_COLOR: Record<string, PaletteColorName> = {
  white: 'white',
  w: 'white',
  black: 'black',
  b: 'black',
  red: 'red',
  r: 'red',
  yellow: 'yellow',
  y: 'yellow',
  blue: 'blue',
  green: 'green',
}

const NAME_TO_HALF_TONE: Record<string, HalfToneName> = {
  half_black: 'half_black',
  gray: 'half_black',
  grey: 'half_black',
  hb: 'half_black',
  half_white: 'half_white',
  hw: 'half_white',
  half_red: 'half_red',
  hr: 'half_red',
  half_yellow: 'half_yellow',
  hy: 'half_yellow',
}

/** BASE_COLORS lookup, re-colored by measured palette overrides when present. */
function baseColorHex(colorName: string, overrides?: PaletteOverrides): string | undefined {
  if (!overrides) {
    return BASE_COLORS[colorName]
  }
  const paletteName = NAME_TO_PALETTE_COLOR[colorName]
  if (paletteName) {
    return paletteBaseHex(paletteName, overrides)
  }
  const halfTone = NAME_TO_HALF_TONE[colorName]
  if (halfTone) {
    return halfToneHex(halfTone, overrides)
  }
  return BASE_COLORS[colorName]
}

const BW_ACCENT_COLOR_NAMES = new Set([
  'red',
  'r',
  'yellow',
  'y',
  'blue',
  'green',
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

function accentColor(accentMode: 'red' | 'yellow', overrides?: PaletteOverrides): string {
  return paletteBaseHex(accentMode === 'yellow' ? 'yellow' : 'red', overrides)
}

function halfAccentColor(accentMode: 'red' | 'yellow', overrides?: PaletteOverrides): string {
  return halfToneHex(accentMode === 'yellow' ? 'half_yellow' : 'half_red', overrides)
}

function expandHex(hex: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    const [, r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return hex.toUpperCase()
}

function applyBwMonochrome(colorName: string, hex: string, overrides?: PaletteOverrides): string {
  if (BW_HALF_TONE_NAMES.has(colorName)) {
    return halfToneHex('half_black', overrides)
  }
  if (BW_ACCENT_COLOR_NAMES.has(colorName)) {
    return paletteBaseHex('black', overrides)
  }
  return hex
}

function applyColorMode(
  colorName: string,
  hex: string,
  colorMode: TagColorMode,
  overrides?: PaletteOverrides,
): string {
  if (colorMode === 'bw') {
    return applyBwMonochrome(colorName, hex, overrides)
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
  const overrides = options.paletteOverrides

  if (color === 'accent' || color === 'a') {
    return applyColorMode(color, accentColor(accentMode, overrides), colorMode, overrides)
  }

  if (color === 'half_accent' || color === 'ha') {
    return applyColorMode(color, halfAccentColor(accentMode, overrides), colorMode, overrides)
  }

  const base = baseColorHex(color, overrides)
  if (base) {
    return applyColorMode(color, base, colorMode, overrides)
  }

  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(color)) {
    const expanded = expandHex(color)
    if (colorMode === 'rgb' || colorMode === 'six') {
      return expanded
    }
    return clampHexToColorMode(expanded, colorMode, overrides)
  }

  // rgb / six: unknown names pass through for designer preview
  if (colorMode === 'rgb' || colorMode === 'six') {
    return color
  }

  return color
}
