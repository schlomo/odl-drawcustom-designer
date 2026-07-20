import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXPORT_ACTION_ERROR_MESSAGE_FEEDBACK_MS,
  EXPORT_ACTION_FEEDBACK_MS,
  type ExportActionFeedback,
} from '../lib/export-action-feedback'

interface FeedbackEntry {
  outcome: ExportActionFeedback
  message: string | null
}

export function useExportActionFeedback(clearAfterMs = EXPORT_ACTION_FEEDBACK_MS) {
  const [feedbackById, setFeedbackById] = useState<Record<string, FeedbackEntry>>({})
  const timersRef = useRef<Map<string, number>>(new Map())

  const flash = useCallback(
    (id: string, outcome: ExportActionFeedback, message: string | null = null) => {
      const entry: FeedbackEntry = { outcome, message }
      setFeedbackById((prev) => ({ ...prev, [id]: entry }))
      const existing = timersRef.current.get(id)
      if (existing != null) {
        window.clearTimeout(existing)
      }
      // A messaged error must stay readable, not vanish with the flash (issue #76).
      const duration = message != null ? EXPORT_ACTION_ERROR_MESSAGE_FEEDBACK_MS : clearAfterMs
      const timer = window.setTimeout(() => {
        setFeedbackById((prev) => {
          if (prev[id] !== entry) {
            return prev
          }
          const next = { ...prev }
          delete next[id]
          return next
        })
        timersRef.current.delete(id)
      }, duration)
      timersRef.current.set(id, timer)
    },
    [clearAfterMs],
  )

  const flashSuccess = useCallback((id: string) => flash(id, 'success'), [flash])
  const flashError = useCallback(
    (id: string, message?: string) => flash(id, 'error', message ?? null),
    [flash],
  )

  const getFeedback = useCallback(
    (id: string): ExportActionFeedback | null => feedbackById[id]?.outcome ?? null,
    [feedbackById],
  )

  const getFeedbackMessage = useCallback(
    (id: string): string | null => feedbackById[id]?.message ?? null,
    [feedbackById],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  return { flashSuccess, flashError, getFeedback, getFeedbackMessage }
}
