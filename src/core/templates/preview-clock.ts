import type { Payload } from '../schema/payload'
import { hasTemplateSyntax, walkStringValues } from './patterns'

export type PreviewClockInterval = 'off' | 'minute' | 'second'

const NOW_CALL_RE = /\bnow\s*\(/i
const STRFTIME_SECONDS_RE = /strftime\s*\(\s*['"][^'"]*%S/i

export function templateUsesNow(value: string): boolean {
  return hasTemplateSyntax(value) && NOW_CALL_RE.test(value)
}

/** True when preview output can change more often than once per minute. */
export function templateNeedsSecondPrecision(value: string): boolean {
  if (!templateUsesNow(value)) {
    return false
  }
  if (STRFTIME_SECONDS_RE.test(value)) {
    return true
  }
  // Bare now() — treat as second-level for live preview.
  if (/now\s*\(\s*\)/.test(value) && !/strftime\s*\(/i.test(value)) {
    return true
  }
  return false
}

export function resolvePreviewClockInterval(payload: Payload): PreviewClockInterval {
  let needsSecond = false
  let needsMinute = false

  walkStringValues(payload, '', (raw) => {
    if (!templateUsesNow(raw)) {
      return
    }
    if (templateNeedsSecondPrecision(raw)) {
      needsSecond = true
      return
    }
    needsMinute = true
  })

  if (needsSecond) {
    return 'second'
  }
  if (needsMinute) {
    return 'minute'
  }
  return 'off'
}
