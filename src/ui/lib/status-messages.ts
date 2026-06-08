export type StatusSeverity = 'error' | 'warning' | 'info'

export interface StatusMessage {
  severity: StatusSeverity
  title: string
  summary: string
  detail?: string
}

const SEVERITY_ORDER: Record<StatusSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

export function sortStatusMessages(messages: readonly StatusMessage[]): StatusMessage[] {
  return [...messages].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  )
}

/** One-line summary for banners (first message, with count when multiple). */
export function summarizeStatusMessages(messages: readonly StatusMessage[]): string | null {
  if (messages.length === 0) {
    return null
  }

  const sorted = sortStatusMessages(messages)
  const first = sorted[0]!
  if (messages.length === 1) {
    return first.summary
  }

  return `${messages.length} issues — ${first.summary}`
}

export function hasBlockingStatus(messages: readonly StatusMessage[]): boolean {
  return messages.some((message) => message.severity === 'error')
}
