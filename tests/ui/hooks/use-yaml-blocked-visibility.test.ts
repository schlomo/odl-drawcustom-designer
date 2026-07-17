/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  YAML_BLOCKED_GRACE_MS,
  useYamlBlockedVisibility,
} from '../../../src/ui/hooks/useYamlBlockedVisibility'

describe('useYamlBlockedVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays hidden while not blocked', () => {
    const { result } = renderHook(() => useYamlBlockedVisibility(false))
    expect(result.current).toBe(false)
  })

  it('does not show immediately when blocked becomes true (grace period)', () => {
    const { result, rerender } = renderHook(({ blocked }) => useYamlBlockedVisibility(blocked), {
      initialProps: { blocked: false },
    })

    rerender({ blocked: true })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS - 1)
    })
    expect(result.current).toBe(false)
  })

  it('becomes visible once the grace period elapses', () => {
    const { result, rerender } = renderHook(({ blocked }) => useYamlBlockedVisibility(blocked), {
      initialProps: { blocked: false },
    })

    rerender({ blocked: true })
    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS)
    })
    expect(result.current).toBe(true)
  })

  it('resets to hidden immediately once blocked clears, with no lingering timer', () => {
    const { result, rerender } = renderHook(({ blocked }) => useYamlBlockedVisibility(blocked), {
      initialProps: { blocked: false },
    })

    rerender({ blocked: true })
    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS)
    })
    expect(result.current).toBe(true)

    rerender({ blocked: false })
    expect(result.current).toBe(false)

    // A stale timer must not resurrect visibility later.
    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS * 2)
    })
    expect(result.current).toBe(false)
  })

  it('does not flicker visible for a blocked spell shorter than the grace period', () => {
    const { result, rerender } = renderHook(({ blocked }) => useYamlBlockedVisibility(blocked), {
      initialProps: { blocked: false },
    })

    rerender({ blocked: true })
    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS / 2)
    })
    rerender({ blocked: false })
    act(() => {
      vi.advanceTimersByTime(YAML_BLOCKED_GRACE_MS)
    })
    expect(result.current).toBe(false)
  })
})
