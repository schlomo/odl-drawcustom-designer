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

/**
 * Jinja `namespace(**kwargs)` — returns a fresh mutable object seeded with the
 * keyword arguments. Nunjucks passes keyword args as a single trailing object
 * shaped `{ ...kwargs, __keywords: true }`, so copy every key except the
 * internal `__keywords` marker.
 */
export function haNamespace(kwargs?: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
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
 */
export function haSetAttr(target: unknown, key: string, value: unknown): string {
  if (target && typeof target === 'object') {
    ;(target as Record<string, unknown>)[key] = value
  }
  return ''
}
