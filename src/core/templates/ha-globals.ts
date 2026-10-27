/** HA template `float(value, default)` — coerces entity state strings to numbers. */
export function haFloat(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : defaultValue
  }

  const text = String(value).trim()
  if (text === '' || text === 'unknown' || text === 'unavailable') {
    return defaultValue
  }

  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

/** HA template `iif(condition, if_true, if_false)` — inline conditional. */
export function haIif<T>(condition: unknown, ifTrue: T, ifFalse: T): T {
  return condition ? ifTrue : ifFalse
}

// Keys whose assignment rewrites the prototype chain or shadows constructor
// plumbing. Deliberately duplicates `UNSAFE_KEYS` in `evaluate.ts`:
// `evaluate.ts` imports this module, so importing the constant back from there
// would create an import cycle.
const UNSAFE_SET_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// Well-known prototypes a template-driven member assignment must never mutate.
// Reaching one through a member-lookup chain (e.g. an array literal's
// `__proto__`) dead-ends in a silent no-op in `haSetAttr`.
const PROTECTED_SET_TARGETS = new Set<unknown>([
  Object.prototype,
  Array.prototype,
  Function.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
])

/**
 * Jinja `namespace(**kwargs)` — returns a fresh mutable object seeded with the
 * keyword arguments. Nunjucks passes keyword args as a single trailing object
 * shaped `{ ...kwargs, __keywords: true }`, so copy every key except the
 * internal `__keywords` marker. The object is created with a null prototype so
 * template member access on a namespace (`n.__proto__`, `n.constructor`) can
 * never reach `Object.prototype` or constructor plumbing.
 */
export function haNamespace(kwargs?: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  if (kwargs && typeof kwargs === 'object') {
    for (const key of Object.keys(kwargs)) {
      if (key === '__keywords') {
        continue
      }
      result[key] = kwargs[key]
    }
  }
  return result
}

/**
 * Mutating member assignment used to emulate Jinja `{% set ns.member = value %}`.
 * Nunjucks does not parse member-target `set`, so member assignments are
 * rewritten to call this helper (see `evaluate.ts`). Returns an empty string so
 * it produces no output when invoked from a `{{ … }}` expression.
 *
 * Dangerous writes are silently refused (matching the evaluator's convention
 * of swallowing blocked sets rather than crashing): prototype-chain keys
 * (`__proto__` / `constructor` / `prototype`), well-known prototype targets,
 * functions, and anything that is not a plain mutable object all no-op.
 *
 * The key must be a string: this global is directly callable from template
 * text, and a non-string key (e.g. `['__proto__']`) would slip past the
 * refusal set only to be coerced into the dangerous string by the bracket
 * assignment below.
 */
export function haSetAttr(target: unknown, key: string, value: unknown): string {
  if (
    target &&
    typeof target === 'object' &&
    typeof key === 'string' &&
    !UNSAFE_SET_KEYS.has(key) &&
    !PROTECTED_SET_TARGETS.has(target)
  ) {
    ;(target as Record<string, unknown>)[key] = value
  }
  return ''
}
