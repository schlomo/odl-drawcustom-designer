import type { AccentMode, ColorOptions } from '../renderer/types'

/** Tag preview color mode — supersedes bare accent where mode implies accent. */
export type TagColorMode = 'bw' | 'bwr' | 'bwy' | 'four' | 'six' | 'rgb'

/** Modes that map to Basic Standard `colour_scheme` 0x00–0x04 (excludes designer-only `rgb`). */
export type ColourSchemeMode = Exclude<TagColorMode, 'rgb'>

export type ColourSchemeValue = 0x00 | 0x01 | 0x02 | 0x03 | 0x04

/** ODL / Basic Standard 4-color tag: black, white, red, yellow. */
export const FOUR_COLOR_PALETTE = ['#000000', '#FFFFFF', '#FF0000', '#FFFF00'] as const

/** Placeholder 6-color ESL palette (hardware TBD). */
export const SIX_COLOR_PALETTE = [
  '#000000',
  '#FFFFFF',
  '#FF0000',
  '#FFFF00',
  '#0000FF',
  '#00FF00',
] as const

const COLOUR_SCHEME_TO_MODE: Record<ColourSchemeValue, ColourSchemeMode> = {
  0x00: 'bw',
  0x01: 'bwr',
  0x02: 'bwy',
  0x03: 'four',
  0x04: 'six',
}

const MODE_TO_COLOUR_SCHEME: Record<ColourSchemeMode, ColourSchemeValue> = {
  bw: 0x00,
  bwr: 0x01,
  bwy: 0x02,
  four: 0x03,
  six: 0x04,
}

export function colourSchemeToColorMode(scheme: number): ColourSchemeMode {
  if (scheme in COLOUR_SCHEME_TO_MODE) {
    return COLOUR_SCHEME_TO_MODE[scheme as ColourSchemeValue]
  }
  return 'bwr'
}

export function colorModeToColourScheme(mode: ColourSchemeMode): ColourSchemeValue {
  return MODE_TO_COLOUR_SCHEME[mode]
}

export function isColourSchemeMode(mode: TagColorMode): mode is ColourSchemeMode {
  return mode !== 'rgb'
}

export function accentModeToColorMode(accent: AccentMode): TagColorMode {
  return accent === 'yellow' ? 'bwy' : 'bwr'
}

/** Default accent keyword mapping — yellow only on BWY; 4-color uses red for `accent`. */
export function colorModeToAccent(mode: TagColorMode): AccentMode {
  return mode === 'bwy' ? 'yellow' : 'red'
}

export function resolveColorMode(options: ColorOptions): TagColorMode {
  if (options.colorMode != null) {
    return options.colorMode
  }
  return accentModeToColorMode(options.accentMode ?? 'red')
}

export function resolveAccentMode(options: ColorOptions): AccentMode {
  return colorModeToAccent(resolveColorMode(options))
}

export function colorOptionsFromContext(ctx: {
  colorMode: TagColorMode
  ditherMode?: ColorOptions['ditherMode']
}): ColorOptions {
  return { colorMode: ctx.colorMode, ditherMode: ctx.ditherMode }
}

export function isTagColorMode(value: unknown): value is TagColorMode {
  return (
    value === 'bw' ||
    value === 'bwr' ||
    value === 'bwy' ||
    value === 'four' ||
    value === 'six' ||
    value === 'rgb'
  )
}

export function migrateAccentModeToColorMode(
  accentMode: AccentMode | undefined,
  colorMode: TagColorMode | undefined,
): TagColorMode {
  if (colorMode != null && isTagColorMode(colorMode)) {
    return colorMode
  }
  return accentModeToColorMode(accentMode ?? 'red')
}
