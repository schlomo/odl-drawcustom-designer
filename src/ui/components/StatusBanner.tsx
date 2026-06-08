import type { StatusMessage } from '../lib/status-messages'
import { shell } from '../styles/shell'

const BANNER_STYLES = {
  error:
    'border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-950/40 text-red-900 dark:text-red-200',
  warning:
    'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100',
  info: 'border-sky-300 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100',
} as const

const SUMMARY_STYLES = {
  error: 'text-red-800 dark:text-red-100',
  warning: 'text-amber-900 dark:text-amber-50',
  info: 'text-sky-900 dark:text-sky-50',
} as const

interface StatusBannerProps {
  message: StatusMessage
}

export function StatusBanner({ message }: StatusBannerProps) {
  return (
    <div
      className={`shrink-0 border-b px-4 py-2 text-xs ${BANNER_STYLES[message.severity]}`}
      role="status"
    >
      <p className="font-medium">{message.title}</p>
      <p className={`mt-1 ${SUMMARY_STYLES[message.severity]}`}>{message.summary}</p>
      {message.detail ? <p className={`mt-1 ${shell.muted}`}>{message.detail}</p> : null}
    </div>
  )
}
