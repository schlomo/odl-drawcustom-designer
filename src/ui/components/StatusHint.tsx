import type { StatusMessage } from '../lib/status-messages'
import { statusSurfaceClassName, statusTextClassName } from '../lib/status-styles'

interface StatusHintProps {
  message: StatusMessage
}

/**
 * Compact inline status hint — shares palette with {@link StatusBanner}.
 *
 * No `aria-label`: on a `role="status"` live region, an author-supplied
 * name replaces the announced content outright, so a label carrying only
 * `message.title` would silently swallow the recovery instruction in
 * `message.summary`. Leaving the name unset lets it derive from the
 * rendered text, matching {@link StatusBanner}'s pattern.
 */
export function StatusHint({ message }: StatusHintProps) {
  return (
    <p
      className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug ${statusSurfaceClassName(message.severity)}`}
      role="status"
    >
      <span className={`font-medium ${statusTextClassName(message.severity)}`}>
        {message.summary === message.title ? message.title : `${message.title} — ${message.summary}`}
      </span>
    </p>
  )
}
