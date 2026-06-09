import type { StatusMessage } from '../lib/status-messages'
import { statusSurfaceClassName, statusTextClassName } from '../lib/status-styles'

interface StatusHintProps {
  message: StatusMessage
}

/** Compact inline status hint — shares palette with {@link StatusBanner}. */
export function StatusHint({ message }: StatusHintProps) {
  return (
    <p
      className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug ${statusSurfaceClassName(message.severity)}`}
      role="status"
      aria-label={message.title}
    >
      <span className={`font-medium ${statusTextClassName(message.severity)}`}>
        {message.summary === message.title ? message.title : `${message.title} — ${message.summary}`}
      </span>
    </p>
  )
}
