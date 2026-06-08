import type opentype from 'opentype.js'

export type FontLoadStatus = 'ready' | 'loading' | 'missing' | 'failed'

export interface FontLoadOutcome {
  key: string
  status: FontLoadStatus
  /** User-facing explanation when status is missing or failed. */
  message?: string
}

export interface FontLoadBatchResult {
  fonts: Map<string, opentype.Font>
  outcomes: Map<string, FontLoadOutcome>
}

export function areFontLoadOutcomeMapsEqual(
  left: ReadonlyMap<string, FontLoadOutcome>,
  right: ReadonlyMap<string, FontLoadOutcome>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, outcome] of left) {
    const other = right.get(key)
    if (!other || other.status !== outcome.status || other.message !== outcome.message) {
      return false
    }
  }

  return true
}

export function fontLoadOutcomesAllReady(outcomes: ReadonlyMap<string, FontLoadOutcome>): boolean {
  if (outcomes.size === 0) {
    return true
  }

  for (const outcome of outcomes.values()) {
    if (outcome.status !== 'ready') {
      return false
    }
  }

  return true
}
