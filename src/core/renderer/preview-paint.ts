import { clampHexToColorMode } from '../display/palette-clamp'
import { colorOptionsFromContext, resolveColorMode } from '../display/palette'
import { paletteOverridesFingerprint, type PaletteOverrides } from '../display/palette-overrides'
import { mapColor } from './colors'
import { halftoneTileColors, shouldUseHalftonePattern } from './dither'
import type { ColorOptions, DitherMode, TagColorMode } from './types'

const HALFTONE_PATTERN_COLOR_NAMES = [
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
] as const

export type PreviewPaintOptions = ColorOptions & {
  ditherMode?: DitherMode
}

export interface ColorPreviewClampInfo {
  yamlHex: string
  tagHex: string
  lost: boolean
}

export interface PreviewDrawColorContext {
  colorMode: TagColorMode
  ditherMode?: DitherMode
  paletteOverrides?: PaletteOverrides
}

export function paintOptionsFromContext(ctx: {
  colorMode: TagColorMode
  ditherMode?: ColorOptions['ditherMode']
  paletteOverrides?: PaletteOverrides
}): PreviewPaintOptions {
  return {
    ...colorOptionsFromContext(ctx),
    ditherMode: ctx.ditherMode,
  }
}

export function paintOptionsFromDrawColor(drawColor: PreviewDrawColorContext): PreviewPaintOptions {
  return {
    colorMode: drawColor.colorMode,
    ditherMode: drawColor.ditherMode,
    paletteOverrides: drawColor.paletteOverrides,
  }
}

export function halftonePatternId(colorName: string, options: ColorOptions): string {
  const mode = resolveColorMode(options)
  // Measured palettes tint the tiles — the fingerprint keeps ids distinct
  // when mounts with different palettes share one document.
  const fingerprint = paletteOverridesFingerprint(options.paletteOverrides)
  return fingerprint ? `ht-${colorName}-${mode}-${fingerprint}` : `ht-${colorName}-${mode}`
}

/** Clamp a resolved hex to the active tag palette (same step as PNG export finalize). */
export function clampPaintToTagMode(hex: string, options: PreviewPaintOptions): string {
  const mode = resolveColorMode(options)
  if (mode === 'rgb') {
    return hex
  }
  return clampHexToColorMode(hex, mode, options.paletteOverrides)
}

function clampHalftoneTileColors(colors: string[], options: PreviewPaintOptions): string[] {
  const mode = resolveColorMode(options)
  if (mode === 'rgb') {
    return colors
  }
  return colors.map((color) => clampHexToColorMode(color, mode, options.paletteOverrides))
}

/**
 * Resolve a YAML color to tag-accurate paint (flat clamped hex or halftone pattern).
 * Uses the same palette rules as dlimg / PNG export — no name remapping beyond accent.
 */
export function resolvePreviewPaint(
  colorName: string | null | undefined,
  options: PreviewPaintOptions,
): string | null {
  if (colorName == null || colorName === 'none') {
    return null
  }

  if (shouldUseHalftonePattern(colorName, options.ditherMode)) {
    return `url(#${halftonePatternId(colorName, options)})`
  }

  const hex = mapColor(colorName, options)
  if (hex == null) {
    return null
  }

  return clampPaintToTagMode(hex, options)
}

/** Compare YAML color intent (RGB preview) to flat tag output — detects palette clamp loss. */
export function getColorPreviewClampInfo(
  colorName: string,
  options: PreviewPaintOptions,
): ColorPreviewClampInfo | null {
  if (colorName.trim() === '' || colorName === 'none') {
    return null
  }
  if (colorName.includes('{{') || colorName.includes('{%')) {
    return null
  }

  const mode = resolveColorMode(options)
  if (mode === 'rgb') {
    return null
  }

  const flatOptions: PreviewPaintOptions = { ...options, ditherMode: 0 }
  const yamlHex = resolvePreviewPaint(colorName, { ...flatOptions, colorMode: 'rgb' })
  const tagHex = resolvePreviewPaint(colorName, flatOptions)

  if (yamlHex == null || tagHex == null) {
    return null
  }
  if (yamlHex.startsWith('url(') || tagHex.startsWith('url(')) {
    return null
  }

  const normalizedYaml = yamlHex.toUpperCase()
  const normalizedTag = tagHex.toUpperCase()

  return {
    yamlHex: normalizedYaml,
    tagHex: normalizedTag,
    lost: normalizedYaml !== normalizedTag,
  }
}

export function resolvePreviewPaintFallback(
  colorName: string | null | undefined,
  options: PreviewPaintOptions,
  fallback = '#000000',
): string {
  return resolvePreviewPaint(colorName, options) ?? fallback
}

function createHalftoneCanvasPattern(
  ctx: CanvasRenderingContext2D,
  colorName: string,
  options: PreviewPaintOptions,
  tileSize = 4,
): CanvasPattern | string {
  const flatFallback = resolvePreviewPaint(colorName, { ...options, ditherMode: 0 }) ?? colorName
  const tile = document.createElement('canvas')
  tile.width = tileSize
  tile.height = tileSize
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) {
    return flatFallback
  }

  const colors = clampHalftoneTileColors(halftoneTileColors(colorName, options, tileSize), options)
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      tileCtx.fillStyle = colors[y * tileSize + x] ?? '#000000'
      tileCtx.fillRect(x, y, 1, 1)
    }
  }

  return ctx.createPattern(tile, 'repeat') ?? flatFallback
}

/** Resolve a YAML color name to a canvas fill/stroke style (flat hex or repeating halftone tile). */
export function resolvePreviewCanvasPaint(
  ctx: CanvasRenderingContext2D,
  colorName: string | null | undefined,
  options: PreviewPaintOptions,
): string | CanvasPattern {
  if (colorName == null || colorName === 'none') {
    return 'transparent'
  }

  if (shouldUseHalftonePattern(colorName, options.ditherMode)) {
    return createHalftoneCanvasPattern(ctx, colorName, options)
  }

  return resolvePreviewPaint(colorName, options) ?? colorName
}

export function renderHalftonePatternDefs(
  options: PreviewPaintOptions,
  tileSize = 4,
): string {
  if (options.ditherMode !== 2) {
    return ''
  }

  return HALFTONE_PATTERN_COLOR_NAMES.map((colorName) => {
    const id = halftonePatternId(colorName, options)
    const colors = clampHalftoneTileColors(halftoneTileColors(colorName, options, tileSize), options)
    const rects = colors
      .map((color, index) => {
        const x = index % tileSize
        const y = Math.floor(index / tileSize)
        return `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`
      })
      .join('')
    return `<pattern id="${id}" width="${tileSize}" height="${tileSize}" patternUnits="userSpaceOnUse">${rects}</pattern>`
  }).join('')
}
