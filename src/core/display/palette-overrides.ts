/**
 * Measured palette overrides (issue #68): a host pushes `color_map`
 * (name → hex, the panel's measured colors) and the ACTIVE palette adopts
 * those hexes everywhere it paints — preview canvas, PNG export finalize,
 * halftone tiles and UI swatches. Without overrides every helper returns the
 * canonical constants, keeping standalone rendering byte-identical.
 */

export const PALETTE_COLOR_NAMES = [
  'black',
  'white',
  'red',
  'yellow',
  'blue',
  'green',
] as const

export type PaletteColorName = (typeof PALETTE_COLOR_NAMES)[number]

/** Name → measured display hex (#RRGGBB, uppercase). */
export type PaletteOverrides = Readonly<Partial<Record<PaletteColorName, string>>>

const CANONICAL_PALETTE_HEX: Record<PaletteColorName, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  yellow: '#FFFF00',
  blue: '#0000FF',
  green: '#00FF00',
}

export type HalfToneName = 'half_black' | 'half_white' | 'half_red' | 'half_yellow'

const CANONICAL_HALF_TONE_HEX: Record<HalfToneName, string> = {
  half_black: '#808080',
  half_white: '#BFBFBF',
  half_red: '#FF8080',
  half_yellow: '#FFFF80',
}

/** Dark component and dark ratio; the light component is always white. */
const HALF_TONE_MIX: Record<HalfToneName, { dark: PaletteColorName; darkRatio: number }> = {
  half_black: { dark: 'black', darkRatio: 0.5 },
  half_white: { dark: 'black', darkRatio: 0.25 },
  half_red: { dark: 'red', darkRatio: 0.5 },
  half_yellow: { dark: 'yellow', darkRatio: 0.5 },
}

function isPaletteColorName(value: string): value is PaletteColorName {
  return (PALETTE_COLOR_NAMES as readonly string[]).includes(value)
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase()
  }
  return null
}

/**
 * Sanitize a host `color_map` into palette overrides: known palette names
 * only (case-insensitive), valid hexes normalized to uppercase #RRGGBB.
 * Returns undefined when nothing usable remains — canonical palettes apply.
 */
export function normalizePaletteOverrides(
  colorMap: Readonly<Record<string, string>> | undefined,
): PaletteOverrides | undefined {
  if (!colorMap) {
    return undefined
  }
  const overrides: Partial<Record<PaletteColorName, string>> = {}
  for (const [name, hex] of Object.entries(colorMap)) {
    const key = name.trim().toLowerCase()
    if (!isPaletteColorName(key) || typeof hex !== 'string') {
      continue
    }
    const normalized = normalizeHex(hex)
    if (normalized) {
      overrides[key] = normalized
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

/** Active hex for a primary palette color — measured override or canonical. */
export function paletteBaseHex(name: PaletteColorName, overrides?: PaletteOverrides): string {
  return overrides?.[name] ?? CANONICAL_PALETTE_HEX[name]
}

function parseChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16)
}

function mixHexes(dark: string, light: string, darkRatio: number): string {
  const channel = (index: number) =>
    Math.round(
      parseChannel(dark, index) * darkRatio + parseChannel(light, index) * (1 - darkRatio),
    )
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

/**
 * Active hex for a half tone. Canonical constants without overrides; with
 * overrides the tone is re-derived as the same blend of the measured primary
 * with measured white (the mix reproduces the canonical constants exactly
 * when fed canonical inputs).
 */
export function halfToneHex(name: HalfToneName, overrides?: PaletteOverrides): string {
  if (!overrides) {
    return CANONICAL_HALF_TONE_HEX[name]
  }
  const { dark, darkRatio } = HALF_TONE_MIX[name]
  return mixHexes(paletteBaseHex(dark, overrides), paletteBaseHex('white', overrides), darkRatio)
}

/** Stable short fingerprint for SVG halftone pattern ids (multi-mount safety). */
export function paletteOverridesFingerprint(overrides: PaletteOverrides | undefined): string {
  if (!overrides) {
    return ''
  }
  const canonicalForm = PALETTE_COLOR_NAMES.filter((name) => overrides[name])
    .map((name) => `${name}:${overrides[name]}`)
    .join(',')
  let hash = 0x811c9dc5
  for (let index = 0; index < canonicalForm.length; index++) {
    hash ^= canonicalForm.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
