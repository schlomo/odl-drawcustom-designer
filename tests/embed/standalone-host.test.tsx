/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountStandaloneApp } from '../../src/embed/standalone'
import type { MountHandle } from '../../src/embed'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import { buildSharePayload, encodeShareHash } from '../../src/share'
import { readSessionFromDb } from '../../src/storage'

// Full-app standalone mounts exceed vitest's 5s default on 2-core CI runners
vi.setConfig({ testTimeout: 30_000 })

/**
 * Lets a test make the standalone bootstrap load fail (IndexedDB unavailable,
 * corrupt session). Unset by default, so every other test runs the real load.
 */
const bootstrapOverride = vi.hoisted(() => ({
  current: null as (() => Promise<AppBootstrap>) | null,
}))

vi.mock('../../src/ui/bootstrap/appBootstrap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/bootstrap/appBootstrap')>()
  return {
    ...actual,
    loadAppBootstrap: (...args: Parameters<typeof actual.loadAppBootstrap>) =>
      bootstrapOverride.current ? bootstrapOverride.current() : actual.loadAppBootstrap(...args),
  }
})

/**
 * Standalone host adapter (issue #72, ADR-017): the GitHub Pages SPA is a
 * host adapter over the same `mount()` lifecycle the library exports. What
 * the standalone user observes must stay exactly as before the convergence —
 * page-DOM rendering (no shadow root), document-level theme, IndexedDB
 * session autosave, `#d=` share-hash bootstrap and re-bootstrap, share link
 * and theme toggle in the chrome, no host Save button.
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

function stubMatchMedia(prefersDark = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark,
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

function shareHash(value: string): string {
  return `#d=${encodeShareHash(
    buildSharePayload({
      name: 'Shared session',
      canvas: {
        width: 200,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value, x: 0, y: 0 }],
    }),
  )}`
}

let container: HTMLElement
const handles: MountHandle[] = []

function mountStandalone(): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mountStandaloneApp(container)
  })
  handles.push(handle)
  return handle
}

/** Standalone renders into the container itself — no shadow root (issue #72). */
function designer() {
  return within(container)
}

/**
 * Same-tab navigation to a share link. Assigning `location.hash` is what the
 * click does, and jsdom fires the `hashchange` for it — dispatching one by hand
 * as well would start *two* bootstraps for one navigation, which no browser
 * does (the second one finds the hash already consumed).
 */
function navigateToShareHash(value: string): Promise<void> {
  return act(async () => {
    window.location.hash = shareHash(value).slice(1)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  bootstrapOverride.current = null
  window.history.replaceState(null, '', '/')
  // Per-test hygiene only: destroy() deliberately leaves the document theme in
  // place (adapter policy, pinned by its own test below).
  document.documentElement.className = ''
  delete document.documentElement.dataset.theme
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

describe('standalone host adapter', () => {
  it('renders into the page DOM and themes document.documentElement', async () => {
    mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    expect(container.shadowRoot).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies a dark system preference to the document before React renders', () => {
    stubMatchMedia(true)

    mountStandalone()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('autosaves the session to IndexedDB — standalone owns persistence', async () => {
    mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    // Poll the actual write instead of sleeping past the 250ms debounce: a
    // fixed sleep races the debounce timer plus the Dexie/IndexedDB write
    // under CI's variable scheduling and was the source of a flaky failure
    // here (`expected null not to be null`) — this waits exactly as long as
    // the write actually takes, however long that is.
    let session: Awaited<ReturnType<typeof readSessionFromDb>> = null
    await waitFor(
      async () => {
        session = await readSessionFromDb()
        expect(session).not.toBeNull()
      },
      { timeout: 15000 },
    )

    expect(session).not.toBeNull()
    expect(session!.elements.length).toBeGreaterThan(0)
  })

  it('bootstraps from a #d= share hash and clears it from the URL', async () => {
    window.history.replaceState(null, '', `/${shareHash('SharedOnLoad')}`)

    mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row')).toHaveLength(1)
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('SharedOnLoad')
    })
    expect(window.location.hash).toBe('')
  })

  it('re-bootstraps when the user navigates to another #d= link in the same tab', async () => {
    mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    await navigateToShareHash('SharedByNavigation')

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row')).toHaveLength(1)
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('SharedByNavigation')
    })
  })

  it('offers the standalone chrome: share link and theme toggle, no host Save button', async () => {
    mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    expect(designer().getByRole('group', { name: 'Copy share link' })).toBeInTheDocument()
    expect(designer().getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
    expect(designer().queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('returns a mount handle whose destroy() empties the container', async () => {
    const handle = mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    act(() => handle.destroy())

    expect(container.childElementCount).toBe(0)
  })

  it('keeps the user session when a re-bootstrap fails after a failed first load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    bootstrapOverride.current = () => Promise.reject(new Error('IndexedDB unavailable'))

    const handle = mountStandalone()

    // A failed first load falls back to a usable default app…
    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })
    // …which then accumulates live state (a display lock here — any App state
    // works; a re-bootstrap remounts the shell and destroys all of it).
    act(() =>
      handle.setCapabilities({
        pixel_width: 296,
        pixel_height: 128,
        rotation_degrees: 0,
        color_scheme: 0x01,
      }),
    )
    // Once the designer's DOM exists its push target is registered (a layout
    // effect, issue #115), so the push lands in this tick — no polling.
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()

    // …and a later failing `#d=` navigation keeps what the user is working in
    // instead of remounting a fresh default app over it.
    await navigateToShareHash('SharedByNavigation')

    // Poll for the observable side effect of the failed re-bootstrap instead
    // of sleeping a fixed duration past it.
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled()
    })
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
  })

  it('leaves the document theme in place on destroy — standalone owns the page', async () => {
    stubMatchMedia(true)
    const handle = mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    act(() => handle.destroy())

    // Reverting would flash the light theme on a page the adapter owns; the
    // next mount re-applies the preference anyway (ADR-017).
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('accepts capabilities pushes on the standalone handle: locks the display, unlock works', async () => {
    // Deliberate uniformity (ADR-017): a push on the standalone handle behaves
    // exactly like an embed push — one lifecycle, one push path.
    const handle = mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()

    act(() =>
      handle.setCapabilities({
        pixel_width: 296,
        pixel_height: 128,
        rotation_degrees: 0,
        color_scheme: 0x01,
      }),
    )

    // No polling: the shell registers its push target in a layout effect, so
    // by the time the designer's DOM is observable the push applies in the
    // same tick it is made. Polling here hid issue #115 — the push was applied
    // a macrotask later, which under CI contention outran the wait.
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(designer().getByLabelText('Resolution')).toBeDisabled()
    expect(designer().getByLabelText('Resolution')).toHaveTextContent(/296\s*×\s*128/)

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    expect(designer().getByLabelText('Resolution')).toBeEnabled()
  })

  it('rejects setTheme — the standalone designer owns the theme preference', async () => {
    const handle = mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    expect(() => handle.setTheme('dark')).toThrow(/owns the theme preference/i)
  })
})
