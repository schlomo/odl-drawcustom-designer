/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolbarLabels } from '../../../src/ui/hooks/useToolbarLabels'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe('useToolbarLabels', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to showing labels before the first layout measure', () => {
    const { result } = renderHook(() => useToolbarLabels('[data-test-toolbar]'))
    expect(result.current.showLabels).toBe(true)
  })

  it('exposes a toolbar ref for measurement', () => {
    const { result } = renderHook(() => useToolbarLabels('[data-test-toolbar]'))
    expect(result.current.toolbarRef).toBeDefined()
    expect(result.current.toolbarRef.current).toBeNull()
  })
})
