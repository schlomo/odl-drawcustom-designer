import { colourSchemeToColorMode, normalizePaletteOverrides, type TagColorMode } from '../core'
import type { CanvasConfig, CanvasRotation } from '../ui/hooks/useProjectState'
import { DEFAULT_DISPLAY_CONFIG, type PreviewDitherMode } from '../ui/preferences/displayConfig'
import type { MockData, MockEntityAttributes } from '../ui/preferences/mockStates'
import type { HostDisplaySpec, HostState, HostStates } from './types'

/**
 * Friendly names the host supplied, by state key (issue #107) — the labels the
 * referenced-states panel shows instead of raw keys.
 */
export type HostStateNames = Readonly<Record<string, string>>

/** Shared empty map: a host that names nothing allocates nothing per render. */
export const NO_HOST_STATE_NAMES: HostStateNames = Object.freeze({})

/**
 * The host's states as the designer consumes them (issue #107, ADR-018 state
 * catalog): the current values, their attributes, and the optional friendly
 * names. Its **presence** is what replaces the State Simulator with the
 * read-only referenced-states panel — standalone has no catalog at all.
 */
export interface HostStateCatalog {
  /** Current value per state key, exactly as last pushed. */
  values: MockData['states']
  /** Attributes per state key, as last pushed. */
  attributes: MockEntityAttributes
  /** Friendly names, for the keys the host named. */
  names: HostStateNames
}

function failStates(message: string): never {
  throw new TypeError(`Invalid host states: ${message}`)
}

/** A plain, non-null, non-array object — the only shape a state record may take. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPrimitiveState(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/**
 * Validate a host `states` push at the boundary that carries it (maintainer
 * ruling 2026-08-17) — the same contract `normalizeHostActions` and
 * `normalizeHostTargets` hold for their channels: a malformed push is a host
 * programming error, so it **throws**, naming the offending key, and the
 * designer is left exactly as it was.
 *
 * Called from `MountHandle.setStates()` and from the embedded adapter's
 * `states` mount option, *before* the push reaches the shell — so a rejected
 * push never latches "this host feeds states" and never becomes the retained
 * last-applied reference the issue-#110 diff compares against. Without that
 * ordering a bad push wedged the channel: the conversion threw halfway through,
 * yet the poisoned reference stayed, and the identical re-push a ticking host
 * naturally makes was silently deduped as "unchanged" (reviewer's repro on
 * PR #142).
 *
 * Unlike actions and targets this does **not** copy: `HostStates` is documented
 * as an immutable snapshot the designer retains by reference (issue #110,
 * docs/embedding.md), and cloning a full entity registry several times a second
 * is exactly the cost that contract exists to avoid. Validation is the same
 * single linear scan the diff already is.
 */
export function assertHostStates(states: HostStates): void {
  if (!isRecord(states)) {
    failStates(`expected an object, got ${JSON.stringify(states) ?? typeof states}`)
  }

  for (const [key, value] of Object.entries(states)) {
    const where = `state ${JSON.stringify(key)}`
    if (isPrimitiveState(value)) {
      continue
    }
    if (!isRecord(value)) {
      failStates(`${where} needs a value or a {state, attributes, name} object (got ${JSON.stringify(value) ?? typeof value})`)
    }
    const record = value as HostState
    if (!isPrimitiveState(record.state)) {
      failStates(`${where} needs a string, number or boolean state (got ${JSON.stringify(record.state) ?? typeof record.state})`)
    }
    if (record.attributes !== undefined && !isRecord(record.attributes)) {
      failStates(`${where} needs attributes as an object (got ${JSON.stringify(record.attributes) ?? typeof record.attributes})`)
    }
    if (record.name !== undefined && typeof record.name !== 'string') {
      failStates(`${where} needs name as a string (got ${JSON.stringify(record.name) ?? typeof record.name})`)
    }
  }
}

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

/**
 * Extract the friendly names a push supplied (issue #107). Only keys the host
 * actually named appear: a plain value, a missing `name` and a blank one all
 * mean "no name", and the panel falls back to showing the key itself.
 *
 * Deliberately separate from {@link hostStatesToMockData}: names are chrome,
 * not template data — a name must never become a state or an attribute a
 * payload could read.
 */
export function hostStatesToNames(states: HostStates): Record<string, string> {
  const names: Record<string, string> = {}
  for (const [key, value] of Object.entries(states)) {
    if (value !== null && typeof value === 'object') {
      const name = usableStateName(value)
      if (name) {
        names[key] = name
      }
    }
  }
  return names
}

/**
 * The name a pushed state actually *means*: trimmed, with a blank one counting
 * as no name at all — one rule shared by the extraction above and the push diff
 * below, so the panel and the diff can never disagree about what changed.
 */
function usableStateName(state: HostState): string | undefined {
  const trimmed = state.name?.trim()
  return trimmed ? trimmed : undefined
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
  return (
    stateA.state === stateB.state &&
    // `name` is part of what a push declares (issue #107), so a rename-only
    // push must not read as "unchanged" and leave the referenced-states panel
    // showing the previous label. Compared as the panel shows it — trimmed, with
    // blank meaning unnamed — so a host re-serializing its registry with
    // different padding still costs nothing (issue #107 review).
    usableStateName(stateA) === usableStateName(stateB) &&
    attributesEqual(stateA.attributes, stateB.attributes)
  )
}

/**
 * Structural equality between two host `states` pushes (issue #110). The
 * upstream OpenDisplay HA integration pushes its *entire* state map — every
 * attribute, on every key — up to 4x/s even when nothing changed, so this is
 * the guard that keeps an unchanged tick from costing more than this scan:
 * linear in key + attribute count, short-circuits on the first difference, and
 * never allocates an intermediate string (unlike a `JSON.stringify`
 * comparison) or a converted mock-data copy.
 */
export function hostStatesEqual(a: HostStates, b: HostStates): boolean {
  if (a === b) {
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => key in b && hostStateValueEqual(a[key]!, b[key]!))
}

/** Key-set + identity equality for a flat map of primitives. */
function flatMapEqual(
  a: Readonly<Record<string, string | number | boolean>>,
  b: Readonly<Record<string, string | number | boolean>>,
): boolean {
  if (a === b) {
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => key in b && a[key] === b[key])
}

/** Equality for the converted flat state-value map (values are always primitives). */
export function mockStatesEqual(a: MockData['states'], b: MockData['states']): boolean {
  return flatMapEqual(a, b)
}

/**
 * Equality for the extracted friendly-name map (issue #107) — the diff that
 * keeps a push which changed only values from re-rendering the panel's labels,
 * and keeps the catalog's identity stable when nothing about names moved.
 */
export function hostStateNamesEqual(a: HostStateNames, b: HostStateNames): boolean {
  return flatMapEqual(a, b)
}

/**
 * Merge a freshly converted attribute map onto the previous one, reusing a
 * state key's previous attribute object when its content is unchanged
 * (issue #110) — so per-key memoization (e.g. a referenced-states panel row,
 * ADR-018) can skip work for the keys a push did not touch.
 *
 * **The previous map itself comes back when no attribute moved** (issue #107
 * review). Attribute identity is what `mockContext` — and through it
 * `previewElements` and the canvas — is memoized on, so returning a fresh
 * top-level map for an attribute-identical push re-evaluated every template in
 * the payload. That is what a rename-only push used to cost: the names moved,
 * the attributes did not, and the merge invalidated the whole preview anyway.
 *
 * Call this only after `hostStatesEqual` established the push changed
 * *something* — this does not itself detect "nothing changed" (that is
 * `hostStatesEqual`'s job, before any conversion happens); it detects "nothing
 * changed *here*", which is what makes each half of a push cost only its own
 * half.
 */
export function mergeMockAttributes(
  previous: MockEntityAttributes,
  next: MockEntityAttributes,
): MockEntityAttributes {
  const merged: MockEntityAttributes = {}
  let allReused = true
  for (const [key, attrs] of Object.entries(next)) {
    const previousAttrs = previous[key]
    const reusable = previousAttrs !== undefined && recordValuesEqual(previousAttrs, attrs)
    merged[key] = reusable ? previousAttrs : attrs
    allReused = allReused && reusable
  }
  // Every key of `next` came from `previous` and the counts match, so the two
  // maps hold the same keys with the same content: keep the identity React and
  // the memo chain are watching.
  return allReused && Object.keys(previous).length === Object.keys(next).length ? previous : merged
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

function resolveColorMode(capabilities: HostDisplaySpec): TagColorMode | null {
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
  capabilities: HostDisplaySpec,
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
