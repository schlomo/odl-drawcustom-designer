import type { HostCapabilities, HostTarget } from './types'

/** Shared empty list: a targets-free designer allocates nothing per render. */
export const NO_HOST_TARGETS: readonly HostTarget[] = Object.freeze([])

/**
 * The capability fields a pushed target retains — the documented
 * {@link HostCapabilities} surface, nothing else. Keeping the copy to a known
 * field set is what makes the push-diff below exact and cheap.
 */
const NUMBER_FIELDS = [
  'pixel_width',
  'pixel_height',
  'rotation_degrees',
  'render_width',
  'render_height',
  'color_scheme',
] as const

function fail(message: string): never {
  throw new TypeError(`Invalid host targets: ${message}`)
}

/** Non-empty text, with the host's incidental padding removed. */
function requireText(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${where} needs a non-empty ${field} (got ${JSON.stringify(value)})`)
  }
  return value.trim()
}

/**
 * Frozen copy of a target's capabilities.
 *
 * Field *values* are not validated here on purpose: `capabilitiesToCanvas`
 * already tolerates junk (a non-quarter rotation falls back to the canonical
 * one, a zero size is ignored) rather than refusing a display the host says
 * exists. A second, stricter contract for the same payload shape would mean
 * two answers to "what is a valid display?".
 */
function copyCapabilities(value: unknown, where: string): HostCapabilities {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${where} needs a capabilities object (got ${JSON.stringify(value)})`)
  }
  const source = value as HostCapabilities
  const copy: HostCapabilities = {}
  for (const field of NUMBER_FIELDS) {
    if (source[field] !== undefined) {
      copy[field] = source[field]
    }
  }
  if (source.accent_color !== undefined) {
    copy.accent_color = source.accent_color
  }
  if (source.palette_measured !== undefined) {
    copy.palette_measured = source.palette_measured
  }
  if (source.available_colors !== undefined) {
    // Checked, not spread blind: `[...value]` on a non-iterable throws a bare
    // "is not iterable" that names neither this module nor the offending
    // target, so the host cannot tell which push it came from.
    if (!Array.isArray(source.available_colors)) {
      fail(
        `${where} needs available_colors as an array (got ${JSON.stringify(source.available_colors)})`,
      )
    }
    copy.available_colors = Object.freeze([...source.available_colors]) as string[]
  }
  if (source.color_map !== undefined) {
    copy.color_map = Object.freeze({ ...source.color_map })
  }
  return Object.freeze(copy)
}

/**
 * Validate and copy a host-pushed target list (issue #106, ADR-018).
 *
 * Same contract as `normalizeHostActions`: **throws** rather than dropping bad
 * entries — a duplicate id or a target with no capabilities is a host
 * programming error, and a display that silently vanishes from the picker (or
 * one that selects nothing) is the kind of thing that ships. A rejected push
 * leaves the designer exactly as it was.
 *
 * The returned targets are frozen copies carrying only known fields, so the
 * push-diff compares against data no host can mutate behind it.
 */
export function normalizeHostTargets(targets: readonly HostTarget[]): readonly HostTarget[] {
  if (!Array.isArray(targets)) {
    fail(`expected an array, got ${typeof targets}`)
  }
  if (targets.length === 0) {
    return NO_HOST_TARGETS
  }

  const seen = new Set<string>()
  // `Array.from`, not `map`: `map` skips a sparse array's holes, and a hole
  // that survives validation renders as a picker entry naming no display.
  const normalized = Array.from(targets, (target, index) => {
    if (target == null || typeof target !== 'object') {
      fail(`entry ${index} is not a target object`)
    }
    const id = requireText(target.id, 'id', `entry ${index}`)
    if (seen.has(id)) {
      fail(`duplicate target id ${JSON.stringify(id)}`)
    }
    seen.add(id)

    const where = `target ${JSON.stringify(id)}`
    return Object.freeze({
      id,
      label: requireText(target.label, 'label', where),
      capabilities: copyCapabilities(target.capabilities, where),
    })
  })

  return Object.freeze(normalized)
}

function arrayEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) {
    return true
  }
  return (
    a != null && b != null && a.length === b.length && a.every((value, index) => value === b[index])
  )
}

function colorMapEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) {
    return true
  }
  if (a == null || b == null) {
    return false
  }
  const aKeys = Object.keys(a)
  return (
    aKeys.length === Object.keys(b).length && aKeys.every((key) => key in b && a[key] === b[key])
  )
}

/**
 * Structural equality over the normalized (known-field) capability copy.
 *
 * Also the test for "the host re-defined the display the design is pinned to":
 * every push carries freshly built objects, so identity says nothing.
 */
export function hostCapabilitiesEqual(a: HostCapabilities, b: HostCapabilities): boolean {
  return (
    a === b ||
    (NUMBER_FIELDS.every((field) => a[field] === b[field]) &&
      a.accent_color === b.accent_color &&
      a.palette_measured === b.palette_measured &&
      arrayEqual(a.available_colors, b.available_colors) &&
      colorMapEqual(a.color_map, b.color_map))
  )
}

/**
 * Structural equality for two normalized target lists — the designer's diff
 * (ADR-018: pushed data is re-pushable, the designer diffs). An unchanged
 * re-push keeps the previous list *identity*, so React bails out of the
 * render instead of re-rendering the picker.
 */
export function hostTargetsEqual(a: readonly HostTarget[], b: readonly HostTarget[]): boolean {
  if (a === b) {
    return true
  }
  if (a.length !== b.length) {
    return false
  }
  return a.every((target, index) => {
    const other = b[index]!
    return (
      target.id === other.id &&
      target.label === other.label &&
      hostCapabilitiesEqual(target.capabilities, other.capabilities)
    )
  })
}

/**
 * The display a pushed list adopts without being picked, or `null` when the
 * list is a choice (issue #121, ADR-018's 2.0 subsumption of the
 * `capabilities` channel).
 *
 * A one-element list is a host saying "this is the display", not offering
 * alternatives — the designer adopts and locks onto it so the first frame is
 * already that display, which is exactly what `capabilities` used to be for.
 * Anything else selects nothing: a list the user can choose between only says
 * what they *can* pick.
 *
 * Whether a *later* push may still adopt is the caller's call — it must not
 * override a display choice the user already made (see `useProjectState`).
 */
export function autoAdoptedHostTarget(targets: readonly HostTarget[]): HostTarget | null {
  return targets.length === 1 ? targets[0]! : null
}

/** The pushed target with this id, or `null` — the picker's lookup. */
export function findHostTarget(
  targets: readonly HostTarget[],
  id: string | null,
): HostTarget | null {
  if (id == null) {
    return null
  }
  return targets.find((target) => target.id === id) ?? null
}
