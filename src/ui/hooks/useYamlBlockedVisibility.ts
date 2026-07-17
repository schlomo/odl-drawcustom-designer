import { useEffect, useState } from 'react'

/**
 * Grace period (ms) before the *visual* blocked overlay appears after the
 * YAML editor's live document starts failing to parse/validate (issue #35).
 * Interaction blocking itself is immediate — callers gate canvas/property
 * panel interactions directly off the (undelayed) `blocked` flag — only the
 * overlay's appearance is delayed, so normal typing through a momentarily
 * invalid document (e.g. mid-keystroke) doesn't flicker it.
 */
export const YAML_BLOCKED_GRACE_MS = 400

/**
 * Delays `visible` becoming `true` by {@link YAML_BLOCKED_GRACE_MS} after
 * `blocked` turns true; resets to `false` immediately once `blocked` clears
 * so editing resumes visibly as soon as the document is valid again.
 */
export function useYamlBlockedVisibility(
  blocked: boolean,
  graceMs: number = YAML_BLOCKED_GRACE_MS,
): boolean {
  const [visible, setVisible] = useState(false)

  // Reset immediately (during render, not as an effect) as soon as `blocked`
  // itself flips back to false — see "Adjusting state when a prop changes"
  // (react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevBlocked, setPrevBlocked] = useState(blocked)
  if (prevBlocked !== blocked) {
    setPrevBlocked(blocked)
    if (!blocked && visible) {
      setVisible(false)
    }
  }

  useEffect(() => {
    if (!blocked) {
      return
    }

    const timeoutId = window.setTimeout(() => setVisible(true), graceMs)
    return () => window.clearTimeout(timeoutId)
  }, [blocked, graceMs])

  return visible
}
