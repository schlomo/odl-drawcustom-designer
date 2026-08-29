/** @vitest-environment jsdom */
import { act } from 'react'
import { waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountDesigner } from '../../src/embed/mount'
import type { DesignerHost } from '../../src/embed/host'
import type { MountHandle } from '../../src/embed'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'

/**
 * The shared mount lifecycle (issue #72, ADR-017) as any host adapter sees it:
 * theme pushes are refused by theme *ownership* (not style scope), and
 * overlapping bootstraps resolve to the newest load. Exercised through
 * `mountDesigner` with stub adapters, because both are lifecycle contracts
 * that today's two shipped adapters cannot both reach.
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
    persistence: null,
    loadBootstrap: () => bootstrapWith('Stub'),
    ...overrides,
  }
}

const KITCHEN_296X128_BWR = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  capabilities: {
    pixel_width: 296,
    pixel_height: 128,
    rotation_degrees: 0,
    color_scheme: 0x01,
  },
}

let container: HTMLElement
const handles: MountHandle[] = []

function mountInto(host: DesignerHost): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mountDesigner(container, host)
  })
  handles.push(handle)
  return handle
}

function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
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

describe('mount lifecycle (ADR-017)', () => {
  it('drains a pre-registration push into the first rendered frame (issue #115)', async () => {
    // The HA panel pushes its display in the same task as mount(), long
    // before an async bootstrap has rendered anything, so the push waits in
    // the lifecycle's pre-registration queue. It must be drained while the
    // shell commits, not a macrotask later: a queue drained after the commit
    // paints one frame of default, unlocked display config first, and anything
    // that samples that frame — a CI test, a screenshot, a host reading the
    // DOM — sees the push as lost.
    let resolveBootstrap!: (bootstrap: AppBootstrap) => void
    const handle = mountInto(
      stubHost({
        loadBootstrap: () =>
          new Promise<AppBootstrap>((resolve) => {
            resolveBootstrap = resolve
          }),
      }),
    )

    handle.setTargets([KITCHEN_296X128_BWR])

    // Samples the first DOM that carries the designer. MutationObserver
    // callbacks are microtasks, so this runs before any macrotask React could
    // use to finish work it deferred past the commit.
    let firstFrameLocked: boolean | null = null
    const shadowRoot = container.shadowRoot!
    const observer = new MutationObserver(() => {
      if (firstFrameLocked !== null || designer().queryAllByTestId('element-list-row').length === 0) {
        return
      }
      firstFrameLocked =
        designer().queryAllByRole('button', { name: 'Unlock display config' }).length > 0
    })
    observer.observe(shadowRoot, { childList: true, subtree: true })

    // Deliberately outside act(): act() collapses the commit, React's
    // passive-effect flush and any follow-up render into one synchronous
    // flush, which is exactly the interleaving this test must not assume.
    // A real host — and CI — runs them as separate tasks.
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    try {
      resolveBootstrap(bootstrapWith('Stub'))
      await waitFor(() => {
        expect(firstFrameLocked).not.toBeNull()
      })
    } finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      observer.disconnect()
    }

    expect(firstFrameLocked).toBe(true)
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
  })

  it('refuses setTheme for a designer-owned theme even when the DOM is shadow-scoped', async () => {
    // Theme ownership is the reason setTheme() is refused — the standalone
    // adapter happens to also be page-scoped, but the M4 HA panel could own
    // its theme (following HA's) inside a shadow root.
    const handle = mountInto(stubHost({ theme: { owner: 'designer' } }))

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row')).toHaveLength(1)
    })

    expect(() => handle.setTheme('dark')).toThrow(/owns the theme preference/i)
    expect(container.shadowRoot!.querySelector('.dark')).toBeNull()
  })

  it('applies the newest bootstrap when a stale overlapping load resolves last', async () => {
    // Rapid `#d=` navigation starts a second bootstrap while the first is
    // still in flight; whichever *resolves* last must not win.
    const resolvers: Array<(bootstrap: AppBootstrap) => void> = []
    let triggerReload = () => {}
    mountInto(
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

    expect(resolvers).toHaveLength(1)
    act(() => triggerReload())
    expect(resolvers).toHaveLength(2)

    await act(async () => {
      resolvers[1]!(bootstrapWith('Newest'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('Newest')
    })

    await act(async () => {
      resolvers[0]!(bootstrapWith('StaleFirstLoad'))
      await Promise.resolve()
    })

    expect(designer().getByTestId('element-list-row')).toHaveTextContent('Newest')
  })

  it('replays a push already applied to a discarded App after a re-bootstrap (issue #118)', async () => {
    // Edge flagged during the #115 investigation (PR #117), deliberately not
    // chased there: a host push queued AND drained into a push target whose
    // App is subsequently discarded by a re-bootstrap (`generation` bump)
    // must not be lost — the fresh App re-registers a brand new target that
    // never itself received the push, so mount.tsx has to replay it.
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

    // The push lands directly on generation 1's already-registered target —
    // the same lock UX the pre-registration test above asserts through.
    act(() => handle.setTargets([KITCHEN_296X128_BWR]))
    await waitFor(() => {
      expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    })

    // A re-bootstrap discards generation 1's App entirely for a fresh one.
    act(() => triggerReload())
    await act(async () => {
      resolvers[1]!(bootstrapWith('Second'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('Second')
    })

    // Generation 2's fresh push target never itself saw the setTargets() push
    // — it must still reflect it, replayed by the mount lifecycle.
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
  })
})
