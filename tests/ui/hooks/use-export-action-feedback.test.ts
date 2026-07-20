/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExportActionFeedback } from '../../../src/ui/hooks/useExportActionFeedback'
import {
  EXPORT_ACTION_ERROR_MESSAGE_FEEDBACK_MS,
  EXPORT_ACTION_FEEDBACK_MS,
} from '../../../src/ui/lib/export-action-feedback'

/**
 * Issue #76: a failed copy must be able to tell the user WHY — flashError
 * carries an optional message that outlives the plain flash so it can be read.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useExportActionFeedback error messages', () => {
  it('exposes the error message alongside the error flash', () => {
    const { result } = renderHook(() => useExportActionFeedback())

    act(() => {
      result.current.flashError('copy-png', 'Clipboard requires HTTPS or localhost')
    })

    expect(result.current.getFeedback('copy-png')).toBe('error')
    expect(result.current.getFeedbackMessage('copy-png')).toBe(
      'Clipboard requires HTTPS or localhost',
    )
  })

  it('keeps a messaged error visible longer than a plain flash, then clears it', () => {
    const { result } = renderHook(() => useExportActionFeedback())

    act(() => {
      result.current.flashError('copy-png', 'Clipboard requires HTTPS or localhost')
    })
    act(() => {
      vi.advanceTimersByTime(EXPORT_ACTION_FEEDBACK_MS + 1)
    })

    expect(result.current.getFeedback('copy-png')).toBe('error')
    expect(result.current.getFeedbackMessage('copy-png')).toBe(
      'Clipboard requires HTTPS or localhost',
    )

    act(() => {
      vi.advanceTimersByTime(EXPORT_ACTION_ERROR_MESSAGE_FEEDBACK_MS)
    })

    expect(result.current.getFeedback('copy-png')).toBeNull()
    expect(result.current.getFeedbackMessage('copy-png')).toBeNull()
  })

  it('a later success clears a lingering error message', () => {
    const { result } = renderHook(() => useExportActionFeedback())

    act(() => {
      result.current.flashError('copy-yaml', 'Clipboard requires HTTPS or localhost')
    })
    act(() => {
      result.current.flashSuccess('copy-yaml')
    })

    expect(result.current.getFeedback('copy-yaml')).toBe('success')
    expect(result.current.getFeedbackMessage('copy-yaml')).toBeNull()
  })

  it('a plain error flash has no message and clears on the normal schedule', () => {
    const { result } = renderHook(() => useExportActionFeedback())

    act(() => {
      result.current.flashError('download-yaml')
    })

    expect(result.current.getFeedback('download-yaml')).toBe('error')
    expect(result.current.getFeedbackMessage('download-yaml')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(EXPORT_ACTION_FEEDBACK_MS + 1)
    })

    expect(result.current.getFeedback('download-yaml')).toBeNull()
  })
})
