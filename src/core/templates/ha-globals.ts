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
