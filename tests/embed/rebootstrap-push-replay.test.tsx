/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import { mountDesigner } from '../../src/embed/mount'
import type { DesignerHost } from '../../src/embed/host'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha (see tests/embed/get-payload.test.tsx).
vi.setConfig({ testTimeout: 30_000 })

/**
 * Adversarial review of PR #159 (issue #118, against pushed SHA `c9fb129`)
 * found the first replay fix's gate — a plain "has this ever registered"
 * boolean — was too coarse: `registerPushTarget` re-runs whenever
 * `useProjectState`'s registration layout effect's deps change, which
 * happens *within* a generation too (`setTheme()` reassigns `bridge`,
 * StrictMode double-invokes every effect once in dev), not only when a
 * re-bootstrap actually discards the App. Replaying into a still-live App
 * for the same generation stomps whatever happened since the last replay —
 * CRITICAL for `payload` (a live design silently reverted), and separately,
 * the naive replay didn't distinguish `payload` (document content, which a
 * new bootstrap should always win over) from `states`/`actions`/`targets`
 * (host context, which should keep surviving a re-bootstrap) — HIGH.
 *
 * mount.tsx's fix: gate the replay on `generation` (replay at most once per
 * generation, only when the generation actually changed), and clear the
 * `payload` slot in `applyBootstrap` so a new bootstrap always supersedes an
 * earlier payload push.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

let container: HTMLElement
const handles: MountHandle[] = []

function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

async function waitForMounted(): Promise<void> {
  await waitFor(() => {
    expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
  })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  handles.length = 0
  return () => {
    for (const handle of handles.splice(0)) {
      try {
        act(() => handle.destroy())
      } catch {
        // already destroyed by the test
      }
    }
  }
})

describe('setTheme() must not replay a stale payload over a live user edit (issue #118 CRITICAL)', () => {
  const PAYLOAD = ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n')
  const PUSHED_PAYLOAD = ['- type: text', '  value: Pushed', '  x: 4', '  y: 4', ''].join('\n')

  it('leaves a user-added element intact, and fires no onStatusChange, across setTheme()', async () => {
    const onStatusChange = vi.fn()
    let handle!: MountHandle
    act(() => {
      handle = mount(container, { payload: PAYLOAD, onStatusChange })
    })
    handles.push(handle)
    await waitForMounted()

    // A host payload push, applied directly to the already-registered target.
    act(() => handle.setPayload(PUSHED_PAYLOAD))
    expect(designer().getAllByTestId('element-list-row')).toHaveLength(1)

    // A genuine user edit through the UI, not a host push — `lastPushes`
    // never learns about this, only the App's own React state does.
    act(() => {
      fireEvent.click(designer().getByRole('button', { name: 'Add text' }))
    })
    expect(designer().getAllByTestId('element-list-row')).toHaveLength(2)

    const before = handle.getStatus()
    onStatusChange.mockClear()

    // setTheme() reassigns `bridge`'s `theme` field (mount.tsx) — a new
    // `host` prop identity for the SAME generation, which retriggers
    // `useProjectState`'s registration layout effect. This must replay
    // nothing: the previously pushed (now stale) payload must not overwrite
    // the user's element.
    act(() => handle.setTheme('dark'))

    expect(designer().getAllByTestId('element-list-row')).toHaveLength(2)
    expect(handle.getStatus().payloadRevision).toBe(before.payloadRevision)
    expect(onStatusChange).not.toHaveBeenCalled()
  })
})

function bootstrapWith(value: string): AppBootstrap {
  return {
    sessionName: value,
    elements: [{ type: 'text', value, x: 0, y: 0 }],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

/** A shadow-scoped adapter, so the tests read the same DOM the embed does. */
function stubHost(overrides: Partial<DesignerHost>): DesignerHost {
  return {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    assetUploadsEnabled: true,
    persistence: null,
    loadBootstrap: () => bootstrapWith('Stub'),
    ...overrides,
  }
}

function mountInto(host: DesignerHost): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mountDesigner(container, host)
  })
  handles.push(handle)
  return handle
}

describe('a re-bootstrap supersedes an earlier payload push, but not host context (issue #118 HIGH)', () => {
  it("shows the new bootstrap's own payload, not a payload pushed under the discarded generation", async () => {
    const resolvers: Array<(bootstrap: AppBootstrap) => void> = []
    let triggerReload = () => {}
    const handle = mountInto(
      stubHost({
        loadBootstrap: () =>
          new Promise<AppBootstrap>((resolve) => {
            resolvers.push(resolve)
          }),
        subscribeBootstrapChanges: (reload) => {
          triggerReload = reload
          return () => {}
        },
      }),
    )

    // Generation 1 mounts and registers a live push target.
    await act(async () => {
      resolvers[0]!(bootstrapWith('First'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('First')
    })

    // A payload push, applied directly to generation 1's live target.
    act(() => handle.setPayload(['- type: text', '  value: PushedOld', '  x: 4', '  y: 4', ''].join('\n')))
    expect(designer().getByTestId('element-list-row')).toHaveTextContent('PushedOld')

    // A re-bootstrap discards generation 1's App for a fresh one with its
    // own, different document.
    act(() => triggerReload())
    await act(async () => {
      resolvers[1]!(bootstrapWith('BootstrapTwo'))
      await Promise.resolve()
    })

    // The new bootstrap's own payload wins — the stale push from the
    // discarded generation must never resurface.
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('BootstrapTwo')
    })
    expect(designer().queryByText(/PushedOld/)).toBeNull()
  })

  it('replays host context (states, actions) into the fresh generation, unlike payload', async () => {
    const templatedBootstrap = (sessionName: string): AppBootstrap => ({
      sessionName,
      elements: [{ type: 'text', value: "{{ states('sensor.demo') }}", x: 0, y: 0 }],
      canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
      service: undefined,
      mockStates: {},
      mockAttributes: {},
      variables: {},
      importSource: 'default',
    })
    const onAction = vi.fn()
    const resolvers: Array<(bootstrap: AppBootstrap) => void> = []
    let triggerReload = () => {}
    const handle = mountInto(
      stubHost({
        loadBootstrap: () =>
          new Promise<AppBootstrap>((resolve) => {
            resolvers.push(resolve)
          }),
        subscribeBootstrapChanges: (reload) => {
          triggerReload = reload
          return () => {}
        },
        onAction,
      }),
    )

    await act(async () => {
      resolvers[0]!(templatedBootstrap('First'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toBeInTheDocument()
    })

    act(() => handle.setStates({ 'sensor.demo': '21.5' }))
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('21.5')
    })

    act(() => handle.setActions([{ id: 'save', label: 'Save Now' }]))
    expect(designer().getByRole('button', { name: 'Save Now' })).toBeInTheDocument()

    // A re-bootstrap discards generation 1's App for a fresh one.
    act(() => triggerReload())
    await act(async () => {
      resolvers[1]!(templatedBootstrap('Second'))
      await Promise.resolve()
    })

    // Host context — unlike payload — replays into the fresh generation.
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('21.5')
    })
    expect(designer().getByRole('button', { name: 'Save Now' })).toBeInTheDocument()
  })
})

const KITCHEN_296X128_BWR = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  display: {
    pixelWidth: 296,
    pixelHeight: 128,
    rotationDegrees: 0,
    colorScheme: 0x01,
  },
}

describe('a within-generation re-registration replays nothing (reviewer PROBE E, issue #118)', () => {
  it("a user's manual unlock survives setTheme() — the replay must not re-lock the display", async () => {
    const handle = mountInto(stubHost({}))

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row')).toHaveLength(1)
    })

    // A host push locks the display to a named target.
    act(() => handle.setTargets([KITCHEN_296X128_BWR]))
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()

    // The user manually unlocks — a UI action, not a host push.
    act(() => {
      fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
    })
    expect(designer().getByRole('button', { name: 'Lock display config' })).toBeInTheDocument()

    // setTheme() triggers a within-generation re-registration (no generation
    // bump) — it must not replay `setTargets()` and re-lock the display over
    // the user's own choice.
    act(() => handle.setTheme('dark'))

    expect(designer().getByRole('button', { name: 'Lock display config' })).toBeInTheDocument()
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
  })
})
