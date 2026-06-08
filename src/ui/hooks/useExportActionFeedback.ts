import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXPORT_ACTION_FEEDBACK_MS,
  type ExportActionFeedback,
} from '../lib/export-action-feedback'

export function useExportActionFeedback(clearAfterMs = EXPORT_ACTION_FEEDBACK_MS) {
  const [feedbackById, setFeedbackById] = useState<Record<string, ExportActionFeedback>>({})
  const timersRef = useRef<Map<string, number>>(new Map())

  const flash = useCallback(
    (id: string, outcome: ExportActionFeedback) => {
      setFeedbackById((prev) => ({ ...prev, [id]: outcome }))
      const existing = timersRef.current.get(id)
      if (existing != null) {
        window.clearTimeout(existing)
      }
      const timer = window.setTimeout(() => {
        setFeedbackById((prev) => {
          if (prev[id] !== outcome) {
            return prev
          }
          const next = { ...prev }
          delete next[id]
          return next
        })
        timersRef.current.delete(id)
      }, clearAfterMs)
      timersRef.current.set(id, timer)
    },
    [clearAfterMs],
  )

  const flashSuccess = useCallback((id: string) => flash(id, 'success'), [flash])
  const flashError = useCallback((id: string) => flash(id, 'error'), [flash])

  const getFeedback = useCallback(
    (id: string): ExportActionFeedback | null => feedbackById[id] ?? null,
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

  return { flashSuccess, flashError, getFeedback }
}
