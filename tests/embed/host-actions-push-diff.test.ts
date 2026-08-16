/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../src/ui/hooks/useProjectState'
import type { DesignerHost } from '../../src/embed/host'
import type { HostAction, HostPushTarget } from '../../src/embed/types'

/**
 * Actions are re-pushable (ADR-018): a host re-pushes the whole list to flip
 * a `disabledReason` or relabel a button — for a connection-state indicator
 * that is once per state change, but a host is free to re-push on a timer.
 * The designer therefore diffs: an unchanged re-push must cost nothing (no
 * setState, no re-render, no new list identity for downstream memoization),
 * the same contract `setStates` holds (issue #110).
 *
 * Exercised directly against the hook with a stub `DesignerHost` whose
 * `registerPushTarget` captures the applier, exactly as
 * `host-states-push-diff.test.ts` does; the full `mount()` → button DOM path
 * is `host-actions.test.tsx`.
 */

const SEND: HostAction = { id: 'send', label: 'Send to display', severity: 'caution' }

function bootstrap(): AppBootstrap {
  return {
    sessionName: 'Test',
    elements: [{ type: 'text', value: 'hello', x: 10, y: 10 }],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

function createTestHost(
  actions?: readonly HostAction[],
): { host: DesignerHost; getPushTarget: () => HostPushTarget } {
  let captured: HostPushTarget | null = null
  const host: DesignerHost = {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    actions,
    loadBootstrap: bootstrap,
    registerPushTarget: (target) => {
      captured = target
      return () => {
        captured = null
      }
    },
  }
  return {
    host,
    getPushTarget: () => {
      if (!captured) {
        throw new Error('push target not registered yet')
      }
      return captured
    },
  }
}

describe('host actions push diff (issue #108)', () => {
  it('seeds the mount-option actions and keeps their identity across an unchanged re-push', () => {
    const { host, getPushTarget } = createTestHost([SEND])
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrap(), host)
    })

    // Mount option ≡ initial push (ADR-018): present before anything is pushed.
    expect(result.current.hostActions).toEqual([SEND])

    const rendersBefore = renderCount
    const actionsBefore = result.current.hostActions

    // A fresh object with identical content — what a host re-pushing its
    // button list on every connection tick sends.
    act(() => {
      getPushTarget().applyActions([{ id: 'send', label: 'Send to display', severity: 'caution' }])
    })

    expect(renderCount).toBe(rendersBefore)
    expect(result.current.hostActions).toBe(actionsBefore)
  })

  it('applies a changed re-push', () => {
    const { host, getPushTarget } = createTestHost([SEND])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => {
      getPushTarget().applyActions([{ ...SEND, disabledReason: 'Display offline' }])
    })

    expect(result.current.hostActions).toEqual([{ ...SEND, disabledReason: 'Display offline' }])

    act(() => {
      getPushTarget().applyActions([])
    })

    expect(result.current.hostActions).toEqual([])
  })

  it('treats a flipped needsPayload as a change, not an unchanged re-push', () => {
    // `needsPayload` decides whether a blocked YAML document disables the
    // button, so a diff blind to it would strand the button in the wrong
    // state until some other field happened to change.
    const { host, getPushTarget } = createTestHost([SEND])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => {
      getPushTarget().applyActions([{ ...SEND, needsPayload: false }])
    })

    expect(result.current.hostActions).toEqual([{ ...SEND, needsPayload: false }])
  })

  it('starts with no actions when the adapter offers none', () => {
    const { host } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    expect(result.current.hostActions).toEqual([])
  })
})
