/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../src/ui/hooks/useProjectState'
import type { DesignerHost } from '../../src/embed/host'
import type { HostPushTarget, HostTarget } from '../../src/embed/types'

/**
 * Targets are re-pushable (ADR-018, issue #106): a host re-pushes the whole
 * display list whenever its inventory changes, and is free to re-push on a
 * timer. The designer therefore diffs — an unchanged re-push must cost nothing
 * (no setState, no re-render, no new list identity for downstream
 * memoization) — while any real change, including one buried in a target's
 * display spec, must land. Same contract `setStates` (issue #110) and
 * `setActions` (issue #108) hold.
 *
 * Exercised directly against the hook with a stub `DesignerHost` whose
 * `registerPushTarget` captures the applier, exactly as
 * `host-actions-push-diff.test.ts` does; the full `mount()` → picker DOM path
 * is `host-targets.test.tsx`.
 */

function officeTarget(): HostTarget {
  return {
    id: 'display.office',
    label: 'Office display',
    display: {
      renderWidth: 400,
      renderHeight: 300,
      colorScheme: 0x00,
      availableColors: ['black', 'white'],
      colorMap: { black: '#000000', white: '#ffffff' },
    },
  }
}

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
  targets?: readonly HostTarget[],
): { host: DesignerHost; getPushTarget: () => HostPushTarget } {
  let captured: HostPushTarget | null = null
  const host: DesignerHost = {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    targets,
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

describe('host targets push diff (issue #106)', () => {
  it('seeds the mount-option targets and keeps their identity across an unchanged re-push', () => {
    const { host, getPushTarget } = createTestHost([officeTarget()])
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrap(), host)
    })

    // Mount option ≡ initial push (ADR-018): present before anything is pushed.
    expect(result.current.hostTargets).toEqual([officeTarget()])

    const rendersBefore = renderCount
    const targetsBefore = result.current.hostTargets

    // Freshly built objects with identical content — what a host re-pushing its
    // display inventory on a timer sends, nested color maps included.
    act(() => {
      getPushTarget().applyTargets([officeTarget()])
    })

    expect(renderCount).toBe(rendersBefore)
    expect(result.current.hostTargets).toBe(targetsBefore)
  })

  it('lands a change buried in a target’s display spec', () => {
    // The display spec is half of what a target *is*, so a diff blind to it
    // would hand back the old values the next time the display is picked —
    // and, while it is the *selected* display, leave the canvas on a size the
    // host has already re-defined (the re-apply rule, maintainer ruling
    // 2026-08-16; its canvas side is asserted through the real picker in
    // host-targets.test.tsx).
    const { host, getPushTarget } = createTestHost([officeTarget()])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    const rotated = officeTarget()
    rotated.display = { ...rotated.display, rotationDegrees: 90 }
    act(() => {
      getPushTarget().applyTargets([rotated])
    })
    expect(result.current.hostTargets).toEqual([rotated])

    const remeasured = officeTarget()
    remeasured.display = {
      ...remeasured.display,
      colorMap: { black: '#111111', white: '#ffffff' },
    }
    act(() => {
      getPushTarget().applyTargets([remeasured])
    })
    expect(result.current.hostTargets).toEqual([remeasured])
  })

  it('lands a relabelled or removed display', () => {
    const { host, getPushTarget } = createTestHost([officeTarget()])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => {
      getPushTarget().applyTargets([{ ...officeTarget(), label: 'Office (renamed)' }])
    })
    expect(result.current.hostTargets).toEqual([
      { ...officeTarget(), label: 'Office (renamed)' },
    ])

    act(() => {
      getPushTarget().applyTargets([])
    })
    expect(result.current.hostTargets).toEqual([])
  })

  it('starts with no targets when the adapter offers none', () => {
    const { host } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    expect(result.current.hostTargets).toEqual([])
    expect(result.current.selectedTargetId).toBeNull()
    expect(result.current.activeTargetId).toBeNull()
  })
})
