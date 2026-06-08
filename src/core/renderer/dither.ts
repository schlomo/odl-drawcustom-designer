import { mapColor } from './colors'
import type { AccentMode, ColorOptions, DitherMode } from './types'

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

function accentHex(accentMode: AccentMode): string {
  return accentMode === 'yellow' ? '#FFFF00' : '#FF0000'
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

export function resolveHalftonePair(colorName: string, accentMode: AccentMode): HalftonePair | null {
  switch (colorName) {
    case 'half_black':
    case 'gray':
    case 'grey':
    case 'hb':
      return { light: '#FFFFFF', dark: '#000000', ratio: 0.5 }
    case 'half_white':
    case 'hw':
      return { light: '#FFFFFF', dark: '#000000', ratio: 0.25 }
    case 'half_red':
    case 'hr':
      return { light: '#FFFFFF', dark: '#FF0000', ratio: 0.5 }
    case 'half_yellow':
    case 'hy':
      return { light: '#FFFFFF', dark: '#FFFF00', ratio: 0.5 }
    case 'half_accent':
    case 'ha':
      return { light: '#FFFFFF', dark: accentHex(accentMode), ratio: 0.5 }
    default:
      return null
  }
}

export function sampleOrderedDitherColor(
  x: number,
  y: number,
  colorName: string,
  accentMode: AccentMode,
): string {
  const pair = resolveHalftonePair(colorName, accentMode)
  if (pair == null) {
    return mapColor(colorName, { accentMode }) ?? '#000000'
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

function nearestHalftoneName(
  r: number,
  g: number,
  b: number,
  accentMode: AccentMode,
): string | null {
  const candidates: Array<{ name: string; rgb: [number, number, number] }> = [
    { name: 'half_black', rgb: [128, 128, 128] },
    { name: 'half_white', rgb: [191, 191, 191] },
    { name: 'half_red', rgb: [255, 128, 128] },
    { name: 'half_yellow', rgb: [255, 255, 128] },
    {
      name: 'half_accent',
      rgb: accentMode === 'yellow' ? [255, 255, 128] : [255, 128, 128],
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

export function applyOrderedDitherBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  colorNameHint: string | null,
  accentMode: AccentMode,
  ditherMode: DitherMode | undefined,
): void {
  if (ditherMode !== 2) {
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
          : nearestHalftoneName(r, g, b, accentMode)

      if (halftoneName == null) {
        continue
      }

      const hex = sampleOrderedDitherColor(x, y, halftoneName, accentMode)
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

export function halftoneTileColors(
  colorName: string,
  accentMode: AccentMode,
  tileSize = 4,
): string[] {
  const colors: string[] = []
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      colors.push(sampleOrderedDitherColor(x, y, colorName, accentMode))
    }
  }
  return colors
}
