import type { StatusMessage } from '../lib/status-messages'
import { statusSurfaceClassName, statusTextClassName } from '../lib/status-styles'
import { shell } from '../styles/shell'

interface StatusBannerProps {
  message: StatusMessage
}

export function StatusBanner({ message }: StatusBannerProps) {
  return (
    <div
      className={`shrink-0 border-b px-4 py-2 text-xs ${statusSurfaceClassName(message.severity)}`}
      role="status"
    >
      <p className={`font-medium ${statusTextClassName(message.severity)}`}>{message.title}</p>
      <p className={`mt-1 ${statusTextClassName(message.severity)}`}>{message.summary}</p>
      {message.detail ? <p className={`mt-1 ${shell.muted}`}>{message.detail}</p> : null}
    </div>
  )
}
