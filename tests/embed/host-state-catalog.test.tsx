/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DesignerHost } from '../../src/embed/host'
import type { HostPushTarget, HostStates } from '../../src/embed/types'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import {
  SHOWCASE_ELEMENTS,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
} from '../../src/ui/data/showcase'
import { hostStatesToMockData } from '../../src/embed/hostContract'
import { useProjectState } from '../../src/ui/hooks/useProjectState'

/**
 * Host-fed state catalog (issue #107, ADR-018): the designer exposes the
 * host's states as a read-only catalog — values plus the optional friendly
 * names — and that catalog's *presence* is what turns the Simulator off. It
 * must survive the issue-#110 push diff (an unchanged push still costs
 * nothing), and Load Demo under a host-fed adapter must load the payload only:
 * demo mocks are Simulator data, and the host stays authoritative for states.
 */

function bootstrapWith(elements: AppBootstrap['elements'], states?: HostStates): AppBootstrap {
  const mock = states ? hostStatesToMockData(states) : { states: {}, attributes: {} }
  return {
    sessionName: 'Test',
    elements,
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: mock.states,
    mockAttributes: mock.attributes,
    variables: {},
    importSource: 'default',
  }
}

const TEMPLATE_ELEMENTS: AppBootstrap['elements'] = [
  { type: 'text', value: "{{ states('sensor.demo_temperature') }}", x: 10, y: 10 },
]

function createTestHost(
  states?: HostStates,
  elements: AppBootstrap['elements'] = TEMPLATE_ELEMENTS,
): {
  host: DesignerHost
  bootstrap: AppBootstrap
  getPushTarget: () => HostPushTarget
} {
  let captured: HostPushTarget | null = null
  const bootstrap = bootstrapWith(elements, states)
  const host: DesignerHost = {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    states,
    loadBootstrap: () => bootstrap,
    registerPushTarget: (target) => {
      captured = target
      return () => {
        captured = null
      }
    },
  }
  return {
    host,
    bootstrap,
    getPushTarget: () => {
      if (!captured) {
        throw new Error('push target not registered yet')
      }
      return captured
    },
  }
}

describe('host-fed state catalog (issue #107)', () => {
  it('is absent with no host states, so the Simulator stays on', () => {
    const { host, bootstrap } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    expect(result.current.hostStateCatalog).toBeNull()
  })

  it('is present on the first frame when states arrive as a mount option', () => {
    const { host, bootstrap } = createTestHost({
      'sensor.demo_temperature': { state: '21.5', name: 'Living-room temperature' },
    })
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    expect(result.current.hostStateCatalog).toEqual({
      values: { 'sensor.demo_temperature': '21.5' },
      attributes: {},
      names: { 'sensor.demo_temperature': 'Living-room temperature' },
    })
  })

  it('appears on the first push and carries values, attributes and names', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': {
          state: '21.5',
          name: 'Living-room temperature',
          attributes: { unit_of_measurement: '°C' },
        },
        'sensor.demo_clock': '12:00:00',
      })
    })

    expect(result.current.hostStateCatalog).toEqual({
      values: { 'sensor.demo_temperature': '21.5', 'sensor.demo_clock': '12:00:00' },
      attributes: { 'sensor.demo_temperature': { unit_of_measurement: '°C' } },
      names: { 'sensor.demo_temperature': 'Living-room temperature' },
    })
  })

  it('follows a rename-only push', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': { state: '21.5', name: 'Living room' },
      })
    })
    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': { state: '21.5', name: 'Balcony' },
      })
    })

    expect(result.current.hostStateCatalog?.names).toEqual({
      'sensor.demo_temperature': 'Balcony',
    })
  })

  it('costs nothing on an unchanged push — the catalog keeps its identity (issue #110)', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrap, host)
    })

    const push = (): HostStates => ({
      'sensor.demo_temperature': { state: '21.5', name: 'Living room' },
    })
    act(() => {
      getPushTarget().applyStates(push())
    })

    const rendersAfterFirstPush = renderCount
    const catalogRef = result.current.hostStateCatalog
    const previewElementsRef = result.current.previewElements

    act(() => {
      getPushTarget().applyStates(push())
    })

    expect(renderCount).toBe(rendersAfterFirstPush)
    expect(result.current.hostStateCatalog).toBe(catalogRef)
    expect(result.current.previewElements).toBe(previewElementsRef)
  })

  // Names are chrome (issue #107 review): a push that moves only a label must
  // update the panel and nothing else. It used to cost a full template
  // re-evaluation, because the attribute merge handed back a fresh top-level map
  // even when no attribute had moved, invalidating `mockContext` through it.
  it('a rename-only push updates the panel without re-evaluating any template', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrap, host)
    })

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': {
          state: '21.5',
          name: 'Living room',
          attributes: { unit_of_measurement: '°C' },
        },
      })
    })

    const rendersAfterFirstPush = renderCount
    const mockContextRef = result.current.mockContext
    const previewElementsRef = result.current.previewElements
    const valuesRef = result.current.hostStateCatalog?.values

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': {
          state: '21.5',
          name: 'Balcony',
          attributes: { unit_of_measurement: '°C' },
        },
      })
    })

    // The panel's label follows the push...
    expect(result.current.hostStateCatalog?.names).toEqual({
      'sensor.demo_temperature': 'Balcony',
    })
    // ...at the cost of exactly one render, with the template context and the
    // evaluated preview (and so the canvas) untouched.
    expect(renderCount).toBe(rendersAfterFirstPush + 1)
    expect(result.current.mockContext).toBe(mockContextRef)
    expect(result.current.previewElements).toBe(previewElementsRef)
    expect(result.current.hostStateCatalog?.values).toBe(valuesRef)
  })

  it('costs nothing at all when a re-push only re-pads a name (issue #107 review)', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    let renderCount = 0
    renderHook(() => {
      renderCount += 1
      return useProjectState(bootstrap, host)
    })

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': { state: '21.5', name: 'Living room' },
      })
    })
    const rendersAfterFirstPush = renderCount

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': { state: '21.5', name: '  Living room  ' },
      })
    })

    expect(renderCount).toBe(rendersAfterFirstPush)
  })

  it('keeps the whole catalog in YAML autocomplete, referenced or not', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': '21.5',
        'sensor.never_referenced': 'on',
      })
    })

    expect(result.current.extraEntityIds).toContain('sensor.never_referenced')
  })
})

/**
 * Variables stay the designer's under host-fed states (maintainer ruling
 * 2026-08-17): they are preview substitutions the design carries, not host
 * state — no push channel supplies them — so the Simulator-off ruling covers
 * states only, and the variables editor must stay reachable and effective.
 */
describe('variables under host-fed states (ruling 2026-08-17)', () => {
  it('are editable and re-evaluate the templates that read them', () => {
    const { host, bootstrap, getPushTarget } = createTestHost(
      { 'sensor.demo_temperature': '21.5' },
      [{ type: 'text', value: '{{ uv_fill }}', x: 10, y: 10 }],
    )
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    expect(result.current.hostStateCatalog).not.toBeNull()

    act(() => {
      result.current.setVariable('uv_fill', 'red')
    })

    expect(result.current.mockContext.variables).toEqual({ uv_fill: 'red' })
    expect(result.current.previewElements[0]).toMatchObject({ type: 'text', value: 'red' })

    // A later host push replaces the states wholesale; it must not touch the
    // variables the user set (there is no host channel for them).
    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '3.2' })
    })

    expect(result.current.mockContext.variables).toEqual({ uv_fill: 'red' })
    expect(result.current.previewElements[0]).toMatchObject({ value: 'red' })
  })
})

describe('Load Demo under host-fed states (issue #107 ruling 2026-08-16)', () => {
  it('loads the demo payload only — host states stay authoritative', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({
        'sensor.demo_temperature': { state: '21.5', name: 'Living-room temperature' },
      })
    })

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.elements).toEqual(SHOWCASE_ELEMENTS)
    // No demo mocks in the state catalog: they are Simulator data, and the
    // Simulator is off here. The next host push would wholesale-overwrite them
    // to unknown anyway (observed on the demo page's ticker, PR #137).
    expect(result.current.hostStateCatalog?.values).toEqual({
      'sensor.demo_temperature': '21.5',
    })
    expect(result.current.hostStateCatalog?.names).toEqual({
      'sensor.demo_temperature': 'Living-room temperature',
    })
    for (const key of Object.keys(SHOWCASE_MOCK_STATES)) {
      // Referenced-but-unsupplied states read as unknown — the honest signal
      // the referenced-states panel surfaces as "not supplied".
      expect(result.current.mockContext.states[key] ?? 'unknown').toBe('unknown')
    }
    // Variables are not a host channel — no push can supply or clobber them —
    // so the demo's own variables still seed.
    expect(result.current.mockContext.variables).toEqual(SHOWCASE_VARIABLES)
  })

  it('does not resurrect the Simulator by leaving the host catalog behind', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })
    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.hostStateCatalog).not.toBeNull()
  })

  it('a host push after Load Demo still lands', () => {
    const { host, bootstrap, getPushTarget } = createTestHost()
    const { result } = renderHook(() => useProjectState(bootstrap, host))

    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '21.5' })
    })
    act(() => {
      result.current.loadDemo()
    })
    act(() => {
      getPushTarget().applyStates({ 'sensor.demo_temperature': '3.2' })
    })

    expect(result.current.hostStateCatalog?.values).toEqual({
      'sensor.demo_temperature': '3.2',
    })
  })
})
