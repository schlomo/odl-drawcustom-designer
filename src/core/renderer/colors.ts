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

export function mapColor(color: ColorInput, options: ColorOptions = {}): string | null {
  if (color == null || color === 'none') {
    return null
  }

  const accentMode = options.accentMode ?? 'red'

  if (color === 'accent' || color === 'a') {
    return accentColor(accentMode)
  }

  if (color === 'half_accent' || color === 'ha') {
    return halfAccentColor(accentMode)
  }

  const base = BASE_COLORS[color]
  if (base) {
    return base
  }

  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(color)) {
    return expandHex(color)
  }

  return color
}
