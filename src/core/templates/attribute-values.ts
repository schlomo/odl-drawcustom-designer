/**
 * Type derivation for Home Assistant entity ATTRIBUTE values.
 *
 * HA entity *states* are always strings (`on`/`off`/`21.5`), but *attributes*
 * carry real types: booleans, numbers, null/None, lists and dicts. The State
 * Simulator collects attribute values from a plain text `<input>`, so we infer
 * the intended type the same way HA/YAML scalars are parsed. This is what makes
 * `state_attr()` / `is_state_attr()` behave like Home Assistant — e.g. a
 * boolean attribute `false` must be the boolean `false`, not the truthy string
 * `"false"`.
 *
 * Rules (first match wins), applied to the trimmed input:
 *   - empty / `null` / `none` (case-insensitive) → `null` (HA None)
 *   - `true` / `false` (case-insensitive)         → boolean
 *   - integer / float / scientific number literal → number
 *   - JSON array (`[…]`) or object (`{…}`)        → parsed value
 *   - anything else                               → the original string
 *
 * NOTE: this is pure core logic (no React) so the evaluator, storage and UI all
 * agree on attribute typing. State values are intentionally NOT coerced here.
 */

const NUMBER_LITERAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

export function coerceAttributeValue(raw: string): unknown {
  const trimmed = raw.trim()

  if (trimmed === '') {
    return null
  }

  const lower = trimmed.toLowerCase()
  if (lower === 'null' || lower === 'none') {
    return null
  }
  if (lower === 'true') {
    return true
  }
  if (lower === 'false') {
    return false
  }

  if (NUMBER_LITERAL.test(trimmed)) {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  const firstChar = trimmed[0]
  if (firstChar === '[' || firstChar === '{') {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      // Not valid JSON — fall through and keep it as a plain string.
    }
  }

  return raw
}

/**
 * HA `is_state_attr(entity, attr, value)` equality: type-sensitive comparison
 * between an attribute's typed value and the expected value. Scalars compare by
 * identity (`false !== "false"`, `1 !== "1"`); arrays/objects compare
 * structurally so list/dict attributes can still match a literal.
 */
export function attributeValueEquals(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    try {
      return JSON.stringify(actual) === JSON.stringify(expected)
    } catch {
      return false
    }
  }
  return false
}
