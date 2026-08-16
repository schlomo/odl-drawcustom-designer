/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'
import type { DesignerHost } from '../../../src/embed/host'
import type { HostPushTarget, HostTarget } from '../../../src/embed/types'

/**
 * Display lock scope (maintainer ruling 2026-08-16, amending issues #70/#106):
 * the lock's scope is dimensions + color mode/palette only. Rotation is a
 * user choice (portrait mounting) and stays editable while locked — it never
 * unlocks the display, never clears the selection, and is never clobbered by
 * a re-apply the user did not ask for.
 *
 * What rotation *does* is the corrected model of issue #139: it chooses the
 * orientation of the logical drawing surface, so the canvas W/H swap on a
 * quarter turn and the designer never rotates the presentation. Every
 * dimension assertion below reads in that model.
 *
 * Exercised directly against the hook with a stub `DesignerHost`, the same
 * harness `host-targets-push-diff.test.ts` uses — the UI-disabled-control
 * side of the ruling (the rotation buttons themselves) is asserted in
 * `tests/embed/display-lock.test.tsx`.
 */

function officeTarget(rotationDegrees = 0): HostTarget {
  return {
    id: 'display.office',
    label: 'Office display',
    capabilities: {
      pixel_width: 296,
      pixel_height: 128,
      rotation_degrees: rotationDegrees,
      color_scheme: 0x01,
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

function createTestHost(targets?: readonly HostTarget[]): {
  host: DesignerHost
  getPushTarget: () => HostPushTarget
} {
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

describe('display lock scope excludes rotation (maintainer ruling 2026-08-16)', () => {
  it('a rotation change while locked to a target keeps the lock and the selection', () => {
    const { host } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    expect(result.current.displayLock).toBe('locked')

    act(() => result.current.setRotation(90))

    expect(result.current.canvas.rotation).toBe(90)
    expect(result.current.displayLock).toBe('locked')
    expect(result.current.activeTargetId).toBe('display.office')
  })

  it('rotation re-orients the logical drawing surface: the stored W/H swap (issue #139)', () => {
    // Corrected rotation model (issue #139): the canvas *is* the logical
    // drawing surface upstream `imagegen` creates already swapped, and the
    // designer always presents it upright. So choosing a quarter turn swaps
    // the stored dimensions themselves — there is no second, "presentation"
    // notion of size for anything downstream to double-apply.
    const { host } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    expect(result.current.canvas.width).toBe(296)
    expect(result.current.canvas.height).toBe(128)

    act(() => result.current.setRotation(90))

    expect(result.current.canvas.rotation).toBe(90)
    expect(result.current.canvas.width).toBe(128)
    expect(result.current.canvas.height).toBe(296)

    // Half turns keep the orientation; only quarter turns swap.
    act(() => result.current.setRotation(270))
    expect(result.current.canvas.width).toBe(128)
    expect(result.current.canvas.height).toBe(296)

    act(() => result.current.setRotation(180))
    expect(result.current.canvas.width).toBe(296)
    expect(result.current.canvas.height).toBe(128)
  })

  it('re-applying the selected target’s capabilities preserves a rotation the user changed since the pick', () => {
    const { host, getPushTarget } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    act(() => result.current.setRotation(90))
    expect(result.current.canvas.rotation).toBe(90)

    // The host re-defines the same display — different physical size, still
    // declaring rotation 0. Dimensions/palette follow the re-push (existing
    // rule); the user's rotation override survives it.
    act(() => {
      getPushTarget().applyTargets([
        { ...officeTarget(0), capabilities: { pixel_width: 400, pixel_height: 300, rotation_degrees: 0, color_scheme: 0x00 } },
      ])
    })

    expect(result.current.canvas.rotation).toBe(90)
    // The surviving rotation orients the re-pushed panel (issue #139): the
    // display declares a 400×300 surface at 0°, the user is holding it at 90°,
    // so the logical drawing surface is that panel turned — 300×400.
    expect(result.current.canvas.width).toBe(300)
    expect(result.current.canvas.height).toBe(400)
    expect(result.current.canvas.colorMode).toBe('bw')
  })

  it('re-picking the target resets the rotation baseline — a later re-apply adopts the fresh declared rotation', () => {
    const { host, getPushTarget } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    act(() => result.current.setRotation(90))
    expect(result.current.canvas.rotation).toBe(90)

    // Re-picking the same target is a fresh baseline: the "adjusted since
    // pick" tracking clears, even though the id did not change.
    act(() => result.current.selectDisplayTarget('display.office'))
    expect(result.current.canvas.rotation).toBe(0)

    // Untouched since that pick, so a later re-apply may adopt the target's
    // newly-declared rotation rather than preserve anything.
    act(() => {
      getPushTarget().applyTargets([{ ...officeTarget(180) }])
    })

    expect(result.current.canvas.rotation).toBe(180)
  })

  it('re-lock after an unlocked rotation change keeps the current rotation, not the locked-target’s declared one', () => {
    const { host } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    act(() => result.current.toggleDisplayLock())
    expect(result.current.displayLock).toBe('unlocked')

    act(() => result.current.setRotation(180))
    expect(result.current.canvas.rotation).toBe(180)

    act(() => result.current.toggleDisplayLock())

    expect(result.current.displayLock).toBe('locked')
    expect(result.current.canvas.rotation).toBe(180)
    // Dimensions/palette are still lock-owned and restored as before.
    expect(result.current.canvas.width).toBe(296)
    expect(result.current.canvas.height).toBe(128)
  })

  it('re-lock restores the host panel oriented to the rotation the user is holding (issue #139)', () => {
    // Rotation is not lock-owned, and under the corrected model it is what
    // says which way round the panel's two dimensions go. Re-locking must
    // therefore restore the *host's panel* in the *user's* orientation — not a
    // 296×128 surface tagged "90°", which no display could ever be.
    const { host } = createTestHost([officeTarget(0)])
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    act(() => result.current.selectDisplayTarget('display.office'))
    act(() => result.current.toggleDisplayLock())
    act(() => result.current.setCanvasSize(111, 222))
    act(() => result.current.setRotation(90))
    expect(result.current.displayLock).toBe('unlocked')

    act(() => result.current.toggleDisplayLock())

    expect(result.current.displayLock).toBe('locked')
    expect(result.current.canvas.rotation).toBe(90)
    expect(result.current.canvas.width).toBe(128)
    expect(result.current.canvas.height).toBe(296)
  })
})
