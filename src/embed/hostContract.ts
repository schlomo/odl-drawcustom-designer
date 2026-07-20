import { colourSchemeToColorMode, normalizePaletteOverrides, type TagColorMode } from '../core'
import type { CanvasConfig, CanvasRotation } from '../ui/hooks/useProjectState'
import type { MockData } from '../ui/preferences/mockStates'
import type { HostCapabilities, HostStates } from './types'

/** Convert host-pushed states into the designer's mock state + attribute maps. */
export function hostStatesToMockData(states: HostStates): MockData {
  const mockStates: MockData['states'] = {}
  const mockAttributes: MockData['attributes'] = {}

  for (const [entityId, value] of Object.entries(states)) {
    if (value !== null && typeof value === 'object') {
      mockStates[entityId] = value.state
      if (value.attributes && Object.keys(value.attributes).length > 0) {
        mockAttributes[entityId] = { ...value.attributes }
      }
      continue
    }
    mockStates[entityId] = value
  }

  return { states: mockStates, attributes: mockAttributes }
}

function normalizeRotation(degrees: number | undefined): CanvasRotation | null {
  if (degrees === undefined || !Number.isFinite(degrees)) {
    return null
  }
  const normalized = ((degrees % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }
  return null
}

function isPositiveSize(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
}

/**
 * Pick the tag color mode from palette color names (color_map keys or
 * available_colors). The names select the palette structure; the measured
 * hex values in `color_map` re-color it via `paletteOverrides` (issue #68).
 */
function paletteNamesToColorMode(names: readonly string[]): TagColorMode | null {
  const normalized = new Set(names.map((name) => name.trim().toLowerCase()))
  if (normalized.size === 0) {
    return null
  }
  const accents = new Set(normalized)
  accents.delete('black')
  accents.delete('white')

  if (accents.size === 0) {
    return 'bw'
  }
  if (accents.size === 1 && accents.has('red')) {
    return 'bwr'
  }
  if (accents.size === 1 && accents.has('yellow')) {
    return 'bwy'
  }
  if (accents.size === 2 && accents.has('red') && accents.has('yellow')) {
    return 'four'
  }
  return 'six'
}

function accentColorToColorMode(accent: string | undefined): TagColorMode | null {
  switch (accent?.trim().toLowerCase()) {
    case 'red':
      return 'bwr'
    case 'yellow':
      return 'bwy'
    default:
      return null
  }
}

function resolveColorMode(capabilities: HostCapabilities): TagColorMode | null {
  const { color_scheme } = capabilities
  if (typeof color_scheme === 'number' && color_scheme >= 0x00 && color_scheme <= 0x04) {
    return colourSchemeToColorMode(color_scheme)
  }
  if (capabilities.color_map && Object.keys(capabilities.color_map).length > 0) {
    return paletteNamesToColorMode(Object.keys(capabilities.color_map))
  }
  if (capabilities.available_colors && capabilities.available_colors.length > 0) {
    return paletteNamesToColorMode(capabilities.available_colors)
  }
  return accentColorToColorMode(capabilities.accent_color)
}

/**
 * Map host capabilities onto the canvas config. Fields the host did not (or
 * could not) provide keep their current value; designer-only preview settings
 * (dither mode) always survive.
 */
export function capabilitiesToCanvas(
  capabilities: HostCapabilities,
  current: CanvasConfig,
): CanvasConfig {
  const rotation = normalizeRotation(capabilities.rotation_degrees) ?? current.rotation

  let width = current.width
  let height = current.height
  if (isPositiveSize(capabilities.render_width) && isPositiveSize(capabilities.render_height)) {
    width = Math.round(capabilities.render_width)
    height = Math.round(capabilities.render_height)
  } else if (isPositiveSize(capabilities.pixel_width) && isPositiveSize(capabilities.pixel_height)) {
    const swap = rotation === 90 || rotation === 270
    width = Math.round(swap ? capabilities.pixel_height : capabilities.pixel_width)
    height = Math.round(swap ? capabilities.pixel_width : capabilities.pixel_height)
  }

  return {
    ...current,
    width,
    height,
    rotation,
    colorMode: resolveColorMode(capabilities) ?? current.colorMode,
    // Measured panel hexes re-color the active palette (issue #68). `accent`
    // resolves through the same map, so accent_color participates implicitly.
    paletteOverrides: normalizePaletteOverrides(capabilities.color_map) ?? current.paletteOverrides,
  }
}
