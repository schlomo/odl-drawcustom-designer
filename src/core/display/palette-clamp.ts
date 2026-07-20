import {
  FOUR_COLOR_PALETTE,
  SIX_COLOR_PALETTE,
  type TagColorMode,
} from './palette'
import {
  halfToneHex,
  paletteBaseHex,
  type HalfToneName,
  type PaletteColorName,
  type PaletteOverrides,
} from './palette-overrides'

const BW_PALETTE = ['#000000', '#FFFFFF', '#808080'] as const
const BWR_PALETTE = ['#000000', '#FFFFFF', '#FF0000', '#808080', '#BFBFBF', '#FF8080'] as const
const BWY_PALETTE = ['#000000', '#FFFFFF', '#FFFF00', '#808080', '#BFBFBF', '#FFFF80'] as const

type PaletteEntry =
  | { kind: 'base'; name: PaletteColorName }
  | { kind: 'half'; name: HalfToneName }

const base = (name: PaletteColorName): PaletteEntry => ({ kind: 'base', name })
const half = (name: HalfToneName): PaletteEntry => ({ kind: 'half', name })

/** Same palette memberships as the hex constants above, by color name. */
const MODE_PALETTE_ENTRIES: Record<Exclude<TagColorMode, 'rgb'>, readonly PaletteEntry[]> = {
  bw: [base('black'), base('white'), half('half_black')],
  bwr: [
    base('black'),
    base('white'),
    base('red'),
    half('half_black'),
    half('half_white'),
    half('half_red'),
  ],
  bwy: [
    base('black'),
    base('white'),
    base('yellow'),
    half('half_black'),
    half('half_white'),
    half('half_yellow'),
  ],
  four: [base('black'), base('white'), base('red'), base('yellow')],
  six: [base('black'), base('white'), base('red'), base('yellow'), base('blue'), base('green')],
}

function paletteEntryHex(entry: PaletteEntry, overrides: PaletteOverrides): string {
  return entry.kind === 'base'
    ? paletteBaseHex(entry.name, overrides)
    : halfToneHex(entry.name, overrides)
}

function parseHexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16)
}

function expandShortHex(hex: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    const [, r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return hex.toUpperCase()
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const normalized = expandShortHex(hex)
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null
  }
  return [
    parseHexChannel(normalized, 1),
    parseHexChannel(normalized, 3),
    parseHexChannel(normalized, 5),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => value.toString(16).padStart(2, '0').toUpperCase()
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

const GREY_RGB: [number, number, number] = [128, 128, 128]

function greyRgb(overrides?: PaletteOverrides): [number, number, number] {
  if (!overrides) {
    return GREY_RGB
  }
  return parseHexRgb(halfToneHex('half_black', overrides)) ?? GREY_RGB
}

/** BWR/BWY only expose one accent primary — the other reads as unprintable grey on-tag. */
function wrongAccentGreyRgb(
  r: number,
  g: number,
  b: number,
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): [number, number, number] | null {
  if (mode === 'bwr' && r >= 200 && g >= 200 && b <= 100) {
    return greyRgb(overrides)
  }
  if (mode === 'bwy' && r >= 200 && g <= 100 && b <= 100) {
    return greyRgb(overrides)
  }
  return null
}

export function paletteColorsForMode(
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): readonly string[] {
  if (mode === 'rgb') {
    return []
  }
  if (overrides) {
    return MODE_PALETTE_ENTRIES[mode].map((entry) => paletteEntryHex(entry, overrides))
  }
  switch (mode) {
    case 'bw':
      return BW_PALETTE
    case 'bwr':
      return BWR_PALETTE
    case 'bwy':
      return BWY_PALETTE
    case 'four':
      return FOUR_COLOR_PALETTE
    case 'six':
      return SIX_COLOR_PALETTE
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

function clampRgbToBw(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min

  if (max >= 250 && min >= 230) {
    return [255, 255, 255]
  }
  if (max <= 15) {
    return [0, 0, 0]
  }
  if (chroma <= 20) {
    const average = (r + g + b) / 3
    if (average >= 192) {
      return [255, 255, 255]
    }
    if (average <= 64) {
      return [0, 0, 0]
    }
    return [128, 128, 128]
  }

  return [0, 0, 0]
}

/** Translate a canonical BW verdict (black/white/grey) onto the measured palette. */
function overrideBwResult(
  canonical: [number, number, number],
  overrides: PaletteOverrides,
): [number, number, number] {
  const hex =
    canonical[0] === 0
      ? paletteBaseHex('black', overrides)
      : canonical[0] === 255
        ? paletteBaseHex('white', overrides)
        : halfToneHex('half_black', overrides)
  return parseHexRgb(hex) ?? canonical
}

export function clampRgbToColorMode(
  r: number,
  g: number,
  b: number,
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): [number, number, number] {
  if (mode === 'rgb') {
    return [r, g, b]
  }
  if (mode === 'bw') {
    const canonical = clampRgbToBw(r, g, b)
    return overrides ? overrideBwResult(canonical, overrides) : canonical
  }

  const wrongAccentGrey = wrongAccentGreyRgb(r, g, b, mode, overrides)
  if (wrongAccentGrey != null) {
    return wrongAccentGrey
  }

  const palette = paletteColorsForMode(mode, overrides)
  let best: [number, number, number] = [r, g, b]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const hex of palette) {
    const rgb = parseHexRgb(hex)
    if (rgb == null) {
      continue
    }
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = rgb
    }
  }

  return best
}

export function clampHexToColorMode(
  hex: string,
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): string {
  if (mode === 'rgb') {
    return expandShortHex(hex)
  }
  const rgb = parseHexRgb(hex)
  if (rgb == null) {
    return hex
  }
  const [r, g, b] = clampRgbToColorMode(rgb[0], rgb[1], rgb[2], mode, overrides)
  return rgbToHex(r, g, b)
}

export function clampImageDataToColorMode(
  rgba: Uint8ClampedArray,
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): void {
  if (mode === 'rgb') {
    return
  }

  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3]
    if (alpha === 0) {
      continue
    }
    const [r, g, b] = clampRgbToColorMode(
      rgba[index],
      rgba[index + 1],
      rgba[index + 2],
      mode,
      overrides,
    )
    rgba[index] = r
    rgba[index + 1] = g
    rgba[index + 2] = b
  }
}

export function imageDataUsesOnlyPaletteColors(
  rgba: Uint8ClampedArray,
  mode: TagColorMode,
  overrides?: PaletteOverrides,
): boolean {
  if (mode === 'rgb') {
    return true
  }

  const allowed = new Set(paletteColorsForMode(mode, overrides))
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] === 0) {
      continue
    }
    const hex = rgbToHex(rgba[index], rgba[index + 1], rgba[index + 2])
    if (!allowed.has(hex)) {
      return false
    }
  }
  return true
}
