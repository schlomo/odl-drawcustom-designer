import type { StatusMessage } from '../lib/status-messages'
import { statusSurfaceClassName, statusTextClassName } from '../lib/status-styles'
import { shell } from '../styles/shell'

interface StatusBannerProps {
  message: StatusMessage
  /**
   * Adds a Dismiss control. Omit for banners that describe live state (a
   * missing asset, a blocked document) — those go away when the state does.
   * Pass it for a one-time report about something that already happened, such
   * as the import notice, which nothing else would ever clear.
   */
  onDismiss?: () => void
}

export function StatusBanner({ message, onDismiss }: StatusBannerProps) {
  return (
    <div
      className={`flex shrink-0 items-start gap-3 border-b px-4 py-2 text-xs ${statusSurfaceClassName(message.severity)}`}
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${statusTextClassName(message.severity)}`}>{message.title}</p>
        <p className={`mt-1 ${statusTextClassName(message.severity)}`}>{message.summary}</p>
        {message.detail ? <p className={`mt-1 ${shell.muted}`}>{message.detail}</p> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          className={`${shell.button} shrink-0`}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}
