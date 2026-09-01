/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../src/ui/hooks/useProjectState'
import type { DesignerHost } from '../../src/embed/host'
import type { HostPushTarget, HostStates } from '../../src/embed/types'

/**
 * Host state-push diff and re-render cost (issue #110): the upstream
 * OpenDisplay HA integration (OpenDisplay/Home_Assistant_Integration#100)
 * pushes the *entire* entity registry via `setStates` up to 4x/s on a busy
 * HA instance, including ticks where nothing actually changed.
 * `useProjectState`'s host push target must:
 *  - cost nothing (no setState, no re-render, no template re-evaluation)
 *    when a push is structurally identical to the last one applied,
 *  - apply a changed subset without disturbing unrelated entities, and
 *  - never touch `elements`/`selectedIndices`/the edit-history ref, so a
 *    push landing between `beginEditCoalesce()`/`endEditCoalesce()` cannot
 *    corrupt an in-progress coalesced edit at the hook's state level.
 *
 * Exercised directly against the hook (not through a full `mount()`), same
 * pattern as `tests/ui/hooks/use-project-state-history.test.ts` — a stub
 * `DesignerHost` whose `registerPushTarget` captures the applier so the test
 * can call `applyStates` exactly like a `MountHandle.setStates()` push would
 * (mount.tsx's push queue is exercised separately in `tests/embed/mount.test.tsx`).
 * This file proves state *isolation*, not gesture behavior — it has no real
 * `DesignerCanvas`, drag session, frozen-elements overlay, or pointer
 * capture. The real-browser drag proof is
 * `tests/e2e/embed-host-push-mid-drag.spec.ts`.
 */

function bootstrapWithTemplate(): AppBootstrap {
  return {
    sessionName: 'Test',
    elements: [
      {
        type: 'text',
        value: "{{ states('sensor.demo_temperature') }}",
        x: 10,
        y: 10,
      },
    ],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

/** A shadow-scoped stub host whose `registerPushTarget` captures the applier
 * directly (bypassing `mountDesigner`'s queue), so the test can call
 * `applyStates` the same way a `MountHandle.setStates()` push does. */
function createTestHost(): { host: DesignerHost; getPushTarget: () => HostPushTarget } {
  let captured: HostPushTarget | null = null
  const host: DesignerHost = {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    assetUploadsEnabled: true,
    persistence: null,
    loadBootstrap: () => bootstrapWithTemplate(),
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

describe('useProjectState host state-push diff (issue #110)', () => {
  it('an identical push causes zero re-renders and zero re-evaluation', () => {
    const { host, getPushTarget } = createTestHost()
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrapWithTemplate(), host)
    })

    const first: HostStates = { 'sensor.demo_temperature': '21.5' }
    act(() => {
      getPushTarget().applyStates(first)
    })
    expect(result.current.previewElements[0]).toMatchObject({ value: '21.5' })

    const renderCountAfterFirstPush = renderCount
    const previewElementsRef = result.current.previewElements
    const mockContextRef = result.current.mockContext

    // A structurally identical push — a fresh object, same content, exactly
    // what a host reconstructing its full entity registry every tick sends.
    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })

    expect(renderCount).toBe(renderCountAfterFirstPush)
    expect(result.current.previewElements).toBe(previewElementsRef)
    expect(result.current.mockContext).toBe(mockContextRef)
  })

  it('a push with one changed entity updates only that entity, preserving attribute identity for the rest', () => {
    const { host, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplate(), host))

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': '21.5',
        'sensor.humidity': { state: '48', attributes: { unit: '%' } },
      })
    })

    const humidityAttrsBefore = result.current.mockContext.attributes['sensor.humidity']
    expect(humidityAttrsBefore).toEqual({ unit: '%' })

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': '22.1', // changed
        'sensor.humidity': { state: '48', attributes: { unit: '%' } }, // unchanged
      })
    })

    expect(result.current.previewElements[0]).toMatchObject({ value: '22.1' })
    expect(result.current.mockContext.states['sensor.humidity']).toBe('48')
    // Unaffected entity's attribute object keeps its previous reference —
    // downstream per-entity memoization (e.g. a referenced-states panel row,
    // ADR-018) can skip work for entities the push did not touch.
    expect(result.current.mockContext.attributes['sensor.humidity']).toBe(humidityAttrsBefore)
  })

  it('a host push interleaved with a coalesced edit never touches elements/selection/history state', () => {
    // What this proves (and what it does not): `applyStates` never touches
    // `elements`/`selectedIndices`/the edit-history ref, so calling it
    // between `beginEditCoalesce()`/`endEditCoalesce()` cannot corrupt the
    // coalesced edit *at the hook's state level*. This is exercised directly
    // against the hook — no real `DesignerCanvas` drag session, frozen-
    // elements overlay, or pointer capture is involved, so it is NOT proof
    // that an actual in-progress canvas drag survives a host push visually
    // untouched (a naive change could still remount/reset the canvas on a
    // push without this test noticing). That real-browser guarantee is
    // `tests/e2e/embed-host-push-mid-drag.spec.ts`, which drives a real
    // pointer drag on the demo host page and pushes `setStates()` mid-
    // gesture.
    const { host, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplate(), host))

    act(() => {
      result.current.beginEditCoalesce()
      result.current.updateElement(0, {
        type: 'text',
        value: "{{ states('sensor.demo_temperature') }}",
        x: 15,
        y: 10,
      })
    })

    // The host state push (issue #110) lands between the coalesce calls,
    // standing in for "mid-gesture" at the hook level only.
    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })

    act(() => {
      result.current.updateElement(0, {
        type: 'text',
        value: "{{ states('sensor.demo_temperature') }}",
        x: 25,
        y: 10,
      })
      result.current.endEditCoalesce()
    })

    // The drag's final position landed, coalesced into one undo step — not
    // split or corrupted by the push in between.
    expect(result.current.elements[0]).toMatchObject({ x: 25, y: 10 })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.historyUndoDepth).toBe(1)
    // The push itself was applied, not dropped or deferred.
    expect(result.current.previewElements[0]).toMatchObject({ value: '21.5' })

    act(() => {
      result.current.undo()
    })
    expect(result.current.elements[0]).toMatchObject({ x: 10, y: 10 })
  })

  it('a Simulator edit between two identical host pushes is reconciled back to host truth', () => {
    // Adjudicated review finding on this PR: `lastHostStatesRef` makes an
    // identical push a no-op, but a local Simulator edit landing *between*
    // two otherwise-identical pushes was not invalidating that cache — so
    // the second push's `hostStatesEqual` short-circuit fired and the
    // Simulator's local override was never overwritten back to host truth
    // (pre-#110 behavior: every push overwrote deterministically). This is
    // a transition-period guarantee — issue #107 plans to disable the
    // Simulator outright once the designer is fed by a live host, at which
    // point this reconciliation path becomes moot.
    const { host, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrapWithTemplate(), host))

    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })
    expect(result.current.mockContext.states['sensor.demo_temperature']).toBe('21.5')

    // Simulator user edit: overrides the mock state locally.
    act(() => {
      result.current.setMockState('sensor.demo_temperature', '99')
    })
    expect(result.current.mockContext.states['sensor.demo_temperature']).toBe('99')

    // A push structurally identical to the *first* push (host truth never
    // changed) must still win over the Simulator's local override.
    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })

    expect(result.current.mockContext.states['sensor.demo_temperature']).toBe('21.5')
    expect(result.current.previewElements[0]).toMatchObject({ value: '21.5' })
  })
})
