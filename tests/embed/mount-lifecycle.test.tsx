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
})
