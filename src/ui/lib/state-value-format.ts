/**
 * Display formatting for mock/host state and attribute values — shared by the
 * State Simulator's editable inputs and the read-only referenced-states panel
 * (issue #107), so the two never disagree on how a value reads.
 */

/** A state value is always a primitive; render it verbatim. */
export function formatStateValue(value: string | number | boolean): string {
  return String(value)
}

/**
 * Render an attribute value as an `<input>`-safe string. Must ALWAYS return a
 * string (never `undefined`, which would flip an input controlled→uncontrolled)
 * and must never throw (e.g. `JSON.stringify` on a BigInt or circular value),
 * which would crash the panel it renders in.
 */
export function formatAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value === null || value === undefined) {
    return ''
  }
  try {
    const json = JSON.stringify(value)
    return typeof json === 'string' ? json : ''
  } catch {
    return ''
  }
}
