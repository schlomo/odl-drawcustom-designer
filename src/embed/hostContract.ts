import { colourSchemeToColorMode, normalizePaletteOverrides, type TagColorMode } from '../core'
import type { CanvasConfig, CanvasRotation } from '../ui/hooks/useProjectState'
import { DEFAULT_DISPLAY_CONFIG, type PreviewDitherMode } from '../ui/preferences/displayConfig'
import type { MockData, MockEntityAttributes } from '../ui/preferences/mockStates'
import type { HostCapabilities, HostState, HostStates } from './types'

/** Convert host-pushed states into the designer's mock state + attribute maps. */
export function hostStatesToMockData(states: HostStates): MockData {
  const mockStates: MockData['states'] = {}
  const mockAttributes: MockData['attributes'] = {}

  for (const [key, value] of Object.entries(states)) {
    if (value !== null && typeof value === 'object') {
      mockStates[key] = value.state
      if (value.attributes && Object.keys(value.attributes).length > 0) {
        mockAttributes[key] = { ...value.attributes }
      }
      continue
    }
    mockStates[key] = value
  }

  return { states: mockStates, attributes: mockAttributes }
}

function deepValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepValueEqual(item, b[index]))
    )
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    return recordValuesEqual(a as Record<string, unknown>, b as Record<string, unknown>)
  }
  return false
}

function recordValuesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) {
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => key in b && deepValueEqual(a[key], b[key]))
}

function attributesEqual(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (a === b) {
    return true
  }
  return recordValuesEqual(a ?? {}, b ?? {})
}

function hostStateValueEqual(
  a: string | number | boolean | HostState,
  b: string | number | boolean | HostState,
): boolean {
  const aIsRecord = a !== null && typeof a === 'object'
  const bIsRecord = b !== null && typeof b === 'object'
  if (aIsRecord !== bIsRecord) {
    return false
  }
  if (!aIsRecord) {
    return a === b
  }
  const stateA = a as HostState
  const stateB = b as HostState
  return stateA.state === stateB.state && attributesEqual(stateA.attributes, stateB.attributes)
}

/**
 * Structural equality between two host `states` pushes (issue #110). The
 * upstream OpenDisplay HA integration pushes its *entire* state registry —
 * every attribute, on every key — up to 4x/s even when nothing changed, so
 * this is the guard that keeps an unchanged tick from costing more than this
 * scan: linear in key + attribute count, short-circuits on the first
 * difference, and never allocates an intermediate string (unlike a
 * `JSON.stringify` comparison) or a converted mock-data copy.
 */
export function hostStatesEqual(a: HostStates, b: HostStates): boolean {
  if (a === b) {
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => key in b && hostStateValueEqual(a[key]!, b[key]!))
}

/** Equality for the converted flat state-value map (values are always primitives). */
export function mockStatesEqual(a: MockData['states'], b: MockData['states']): boolean {
  if (a === b) {
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => key in b && a[key] === b[key])
}

/**
 * Merge a freshly converted attribute map onto the previous one, reusing
 * each entity's previous attribute object when its content is unchanged
 * (issue #110) — so any future per-entity memoization (e.g. a
 * referenced-states panel row, ADR-018) can skip work for entities a push
 * did not touch. The returned top-level map is always new; call this only
 * after `hostStatesEqual` already established the push changed something —
 * this does not itself detect "nothing changed" (that is
 * `hostStatesEqual`'s job, before any conversion happens).
 */
export function mergeMockAttributes(
  previous: MockEntityAttributes,
  next: MockEntityAttributes,
): MockEntityAttributes {
  const merged: MockEntityAttributes = {}
  for (const [key, attrs] of Object.entries(next)) {
    const previousAttrs = previous[key]
    merged[key] = previousAttrs && recordValuesEqual(previousAttrs, attrs) ? previousAttrs : attrs
  }
  return merged
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
 * Map a display target's capabilities onto the canvas config — the designer's
 * one display mapping (issue #106; the `capabilities` push channel it used to
 * share this with is gone, issue #121).
 *
 * The base is always the designer's **canonical defaults**, never the canvas in
 * front of the user: adopting a display *is* that display, so the same target
 * must produce the same canvas whatever preceded it. Merging onto the current
 * config would leak the previous display's facts into a target that never
 * declared them — its rotation (296×128 arriving as 128×296), or worse its
 * measured `color_map`, which paints one panel's red on another's tag (ADR-007
 * parity).
 *
 * `previewDitherMode` is the one thing carried over, because it is not a
 * property of any display: it is a designer-only preview setting the user owns,
 * exactly as the display-config lock treats it.
 *
 * **Host contract (issue #139 review):** `rotation_degrees` MUST describe the
 * orientation `render_width`/`render_height` are expressed in — the *effective*
 * orientation of the drawing surface, not a base rotation still to be applied
 * to it. The result of this mapping is one indivisible oriented surface (two
 * dimensions plus the rotation they are in), and everything downstream turns
 * that pair as a unit. A host that pairs a base rotation with effective-swapped
 * dimensions is out of contract: the designer cannot detect the mismatch, and
 * the surface will read the wrong way round when the user re-orients it.
 */
export function capabilitiesToCanvas(
  capabilities: HostCapabilities,
  previewDitherMode: PreviewDitherMode,
): CanvasConfig {
  const base: CanvasConfig = { ...DEFAULT_DISPLAY_CONFIG, previewDitherMode }
  const rotation = normalizeRotation(capabilities.rotation_degrees) ?? base.rotation

  let width = base.width
  let height = base.height
  if (isPositiveSize(capabilities.render_width) && isPositiveSize(capabilities.render_height)) {
    width = Math.round(capabilities.render_width)
    height = Math.round(capabilities.render_height)
  } else if (isPositiveSize(capabilities.pixel_width) && isPositiveSize(capabilities.pixel_height)) {
    const swap = rotation === 90 || rotation === 270
    width = Math.round(swap ? capabilities.pixel_height : capabilities.pixel_width)
    height = Math.round(swap ? capabilities.pixel_width : capabilities.pixel_height)
  }

  return {
    ...base,
    width,
    height,
    rotation,
    colorMode: resolveColorMode(capabilities) ?? base.colorMode,
    // Measured panel hexes re-color the active palette (issue #68). `accent`
    // resolves through the same map, so accent_color participates implicitly.
    paletteOverrides: normalizePaletteOverrides(capabilities.color_map) ?? base.paletteOverrides,
  }
}
