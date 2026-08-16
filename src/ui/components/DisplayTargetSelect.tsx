import type { HostTarget } from '../../embed/types'
import { shell } from '../styles/shell'
import { StatusHint } from './StatusHint'

/**
 * The virtual display — an empty option value, which no target id can ever
 * collide with (ids are validated non-empty). Target ids are prefixed for the
 * same reason: an opaque host id must never be mistaken for a sentinel.
 */
const VIRTUAL_DISPLAY_VALUE = ''
/** The display a bare `capabilities` push defined: real, but unnamed. */
const ANONYMOUS_HOST_VALUE = 'host'
const TARGET_VALUE_PREFIX = 'target:'

const STALE_TARGET_STATUS_TITLE = 'Display no longer available'

interface DisplayTargetSelectProps {
  targets: readonly HostTarget[]
  /** The remembered selection: kept while unlocked, and while stale. */
  selectedTargetId: string | null
  /** The selection's last-known label — the only name a removed target has left. */
  selectedTargetLabel: string | null
  /** Whether the display config is locked onto a host display (issue #70). */
  locked: boolean
  onSelect: (targetId: string | null) => void
}

/**
 * Display picker (issue #106, ADR-018 targets seam): the host pushes the
 * displays it knows about, the designer offers them here, inside its own
 * display-config area — no host chrome outside the mount.
 *
 * What the picker shows is the display the design is *pinned to*, so it reads
 * the same way as the lock next to it:
 *
 * - a selected target while locked onto it;
 * - "Host display" while locked onto an unnamed display (a bare
 *   `capabilities` push — an anonymous target);
 * - "Virtual display" whenever the config is unlocked, which is what unlocking
 *   means. The selection is still remembered: re-locking (or picking the
 *   target again) returns to it.
 *
 * A selection the host has since removed keeps its last-known display and is
 * marked unavailable rather than switched away (maintainer ruling
 * 2026-08-16) — the remaining displays stay one pick away.
 *
 * A native `<select>` on purpose: its popup is browser chrome, so this adds no
 * floating layer that could need space outside the mount boundary (embed
 * invariant — an HA panel may give the mount zero room on any side).
 */
export function DisplayTargetSelect({
  targets,
  selectedTargetId,
  selectedTargetLabel,
  locked,
  onSelect,
}: DisplayTargetSelectProps) {
  // "Unavailable" applies exactly while the missing display is the one in
  // effect. Unlocked, the design is pinned to nothing — the picker reads
  // "Virtual display" and offers what the host still has; re-locking returns to
  // the missing display and marks it again.
  const staleTargetId =
    locked && selectedTargetId != null && !targets.some((target) => target.id === selectedTargetId)
      ? selectedTargetId
      : null
  const showAnonymousHostDisplay = locked && selectedTargetId == null

  const value = !locked
    ? VIRTUAL_DISPLAY_VALUE
    : selectedTargetId != null
      ? `${TARGET_VALUE_PREFIX}${selectedTargetId}`
      : ANONYMOUS_HOST_VALUE

  return (
    <>
      <label className={`mt-2 block text-xs ${shell.muted}`}>
        Display
        <select
          className={`mt-1 w-full ${shell.input}`}
          value={value}
          onChange={(event) => {
            const next = event.target.value
            if (next === VIRTUAL_DISPLAY_VALUE) {
              onSelect(null)
              return
            }
            if (next === ANONYMOUS_HOST_VALUE) {
              // Only ever rendered as the current value; nothing to switch to.
              return
            }
            onSelect(next.slice(TARGET_VALUE_PREFIX.length))
          }}
        >
          {showAnonymousHostDisplay ? (
            <option value={ANONYMOUS_HOST_VALUE}>Host display</option>
          ) : null}
          {staleTargetId != null ? (
            <option value={`${TARGET_VALUE_PREFIX}${staleTargetId}`}>
              {`${selectedTargetLabel ?? staleTargetId} (unavailable)`}
            </option>
          ) : null}
          {targets.map((target) => (
            <option key={target.id} value={`${TARGET_VALUE_PREFIX}${target.id}`}>
              {target.label}
            </option>
          ))}
          <option value={VIRTUAL_DISPLAY_VALUE}>Virtual display</option>
        </select>
      </label>
      {staleTargetId != null ? (
        <StatusHint
          message={{
            severity: 'warning',
            title: STALE_TARGET_STATUS_TITLE,
            summary: 'showing its last known display config — pick another display to switch',
          }}
        />
      ) : null}
    </>
  )
}
