import {
  colorModeToAccent,
  resolveAccentMode,
  resolveColorMode,
  type TagColorMode,
} from '../display/palette'
import { clampImageDataToColorMode } from '../display/palette-clamp'
import {
  halfToneHex,
  paletteBaseHex,
  type PaletteOverrides,
} from '../display/palette-overrides'
import { mapColor } from './colors'
import type { ColorOptions, DitherMode } from './types'

export type { DitherMode } from './types'

const HALFTONE_COLOR_NAMES = new Set([
  'half_black',
  'gray',
  'grey',
  'hb',
  'half_white',
  'hw',
  'half_red',
  'hr',
  'half_yellow',
  'hy',
  'half_accent',
  'ha',
])

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

export interface HalftonePair {
  light: string
  dark: string
  ratio: number
}

function accentHex(options: ColorOptions): string {
  return mapColor('accent', options) ?? '#000000'
}

export function isHalftoneColorName(color: string): boolean {
  return HALFTONE_COLOR_NAMES.has(color)
}

export function shouldUseHalftonePattern(color: string, ditherMode: DitherMode | undefined): boolean {
  return ditherMode === 2 && isHalftoneColorName(color)
}

export function bayerThreshold(x: number, y: number, size = 4): number {
  const matrixX = ((x % size) + size) % size
  const matrixY = ((y % size) + size) % size
  return BAYER_4X4[matrixY][matrixX] / (size * size)
}

export function resolveHalftonePair(colorName: string, options: ColorOptions): HalftonePair | null {
  const colorMode = resolveColorMode(options)
  const overrides = options.paletteOverrides
  const white = paletteBaseHex('white', overrides)

  switch (colorName) {
    case 'half_black':
    case 'gray':
    case 'grey':
    case 'hb':
      return { light: white, dark: paletteBaseHex('black', overrides), ratio: 0.5 }
    case 'half_white':
    case 'hw':
      return { light: white, dark: paletteBaseHex('black', overrides), ratio: 0.25 }
    case 'half_red':
    case 'hr':
      return colorMode === 'bw'
        ? { light: white, dark: halfToneHex('half_black', overrides), ratio: 0.5 }
        : { light: white, dark: paletteBaseHex('red', overrides), ratio: 0.5 }
    case 'half_yellow':
    case 'hy':
      return colorMode === 'bw'
        ? { light: white, dark: halfToneHex('half_black', overrides), ratio: 0.5 }
        : { light: white, dark: paletteBaseHex('yellow', overrides), ratio: 0.5 }
    case 'half_accent':
    case 'ha':
      return { light: white, dark: accentHex(options), ratio: 0.5 }
    default:
      return null
  }
}

export function sampleOrderedDitherColor(
  x: number,
  y: number,
  colorName: string,
  options: ColorOptions,
): string {
  const pair = resolveHalftonePair(colorName, options)
  if (pair == null) {
    return mapColor(colorName, options) ?? '#000000'
  }

  return bayerThreshold(x, y) < pair.ratio ? pair.dark : pair.light
}

export function resolvePreviewColor(
  color: string | null | undefined,
  options: ColorOptions & { ditherMode?: DitherMode },
): string | null {
  if (color == null || color === 'none') {
    return null
  }

  if (shouldUseHalftonePattern(color, options.ditherMode)) {
    return mapColor(color, options)
  }

  return mapColor(color, options)
}

function parseHexColor(hex: string): [number, number, number] | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return null
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function halfToneRgb(
  name: 'half_black' | 'half_white' | 'half_red' | 'half_yellow',
  overrides?: PaletteOverrides,
): [number, number, number] {
  return parseHexColor(halfToneHex(name, overrides)) ?? [0, 0, 0]
}

function nearestHalftoneName(r: number, g: number, b: number, options: ColorOptions): string | null {
  const accentMode = resolveAccentMode(options)
  const overrides = options.paletteOverrides
  const candidates: Array<{ name: string; rgb: [number, number, number] }> = [
    { name: 'half_black', rgb: halfToneRgb('half_black', overrides) },
    { name: 'half_white', rgb: halfToneRgb('half_white', overrides) },
    { name: 'half_red', rgb: halfToneRgb('half_red', overrides) },
    { name: 'half_yellow', rgb: halfToneRgb('half_yellow', overrides) },
    {
      name: 'half_accent',
      rgb: halfToneRgb(accentMode === 'yellow' ? 'half_yellow' : 'half_red', overrides),
    },
  ]

  let best: { name: string; distance: number } | null = null
  for (const candidate of candidates) {
    const distance =
      (r - candidate.rgb[0]) ** 2 + (g - candidate.rgb[1]) ** 2 + (b - candidate.rgb[2]) ** 2
    if (best == null || distance < best.distance) {
      best = { name: candidate.name, distance }
    }
  }

  return best?.name ?? null
}

function rgbDistanceSq(r: number, g: number, b: number, rgb: [number, number, number]): number {
  return (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
}

function solidPrimariesForMode(
  mode: ReturnType<typeof resolveColorMode>,
  overrides?: PaletteOverrides,
): [number, number, number][] {
  const primary = (name: Parameters<typeof paletteBaseHex>[0]): [number, number, number] =>
    parseHexColor(paletteBaseHex(name, overrides)) ?? [0, 0, 0]

  switch (mode) {
    case 'bw':
      return [primary('black'), primary('white')]
    case 'bwr':
      return [primary('black'), primary('white'), primary('red')]
    case 'bwy':
      return [primary('black'), primary('white'), primary('yellow')]
    case 'four':
      return [primary('black'), primary('white'), primary('red'), primary('yellow')]
    case 'six':
      return [
        primary('black'),
        primary('white'),
        primary('red'),
        primary('yellow'),
        primary('blue'),
        primary('green'),
      ]
    case 'rgb':
      return []
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

/** Only pixels already rendered as flat halftone tones should be Bayer-dithered. */
function resolveHalftoneNameForDitherPixel(
  r: number,
  g: number,
  b: number,
  options: ColorOptions,
): string | null {
  const halftoneName = nearestHalftoneName(r, g, b, options)
  if (halftoneName == null) {
    return null
  }

  const halftoneHex = mapColor(halftoneName, options)
  const halftoneRgb = halftoneHex != null ? parseHexColor(halftoneHex) : null
  if (halftoneRgb == null) {
    return null
  }

  const distToHalftone = rgbDistanceSq(r, g, b, halftoneRgb)
  const colorMode = resolveColorMode(options)
  let minSolidDistance = Number.POSITIVE_INFINITY
  for (const solid of solidPrimariesForMode(colorMode, options.paletteOverrides)) {
    minSolidDistance = Math.min(minSolidDistance, rgbDistanceSq(r, g, b, solid))
  }

  if (minSolidDistance <= distToHalftone) {
    return null
  }

  const maxChannelDelta = Math.max(
    Math.abs(r - halftoneRgb[0]),
    Math.abs(g - halftoneRgb[1]),
    Math.abs(b - halftoneRgb[2]),
  )
  if (maxChannelDelta > 48) {
    return null
  }

  return halftoneName
}

export function applyOrderedDitherBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  colorNameHint: string | null,
  options: ColorOptions,
): void {
  if (options.ditherMode !== 2) {
    return
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const r = rgba[index]
      const g = rgba[index + 1]
      const b = rgba[index + 2]

      const halftoneName =
        colorNameHint != null && isHalftoneColorName(colorNameHint)
          ? colorNameHint
          : resolveHalftoneNameForDitherPixel(r, g, b, options)

      if (halftoneName == null) {
        continue
      }

      const hex = sampleOrderedDitherColor(x, y, halftoneName, options)
      const rgb = parseHexColor(hex)
      if (rgb == null) {
        continue
      }

      rgba[index] = rgb[0]
      rgba[index + 1] = rgb[1]
      rgba[index + 2] = rgb[2]
    }
  }
}

/** Clamp raster pixels to the tag palette, then Bayer-dither halftone tones when d=2. */
export function finalizeTagImageData(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ColorOptions & { ditherMode?: DitherMode },
): void {
  const colorMode = resolveColorMode(options)
  if (colorMode !== 'rgb') {
    clampImageDataToColorMode(rgba, colorMode as TagColorMode, options.paletteOverrides)
  }
  if (options.ditherMode === 2 && colorMode !== 'rgb') {
    applyOrderedDitherBuffer(rgba, width, height, null, options)
  }
}

export function halftoneTileColors(
  colorName: string,
  options: ColorOptions,
  tileSize = 4,
): string[] {
  const colors: string[] = []
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      colors.push(sampleOrderedDitherColor(x, y, colorName, options))
    }
  }
  return colors
}

export { colorModeToAccent }
