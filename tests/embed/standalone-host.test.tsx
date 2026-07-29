/** @vitest-environment jsdom */
import { act } from 'react'
import { waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountStandaloneApp } from '../../src/embed/standalone'
import type { MountHandle } from '../../src/embed'
import { buildSharePayload, encodeShareHash } from '../../src/share'
import { readSessionFromDb } from '../../src/storage'

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

/** The session autosave / mock-write debounce is 250ms; wait past it. */
function afterDebounce(): Promise<void> {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)))
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  window.history.replaceState(null, '', '/')
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
    await afterDebounce()

    const session = await readSessionFromDb()
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

    await act(async () => {
      window.location.hash = shareHash('SharedByNavigation').slice(1)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      await Promise.resolve()
    })

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

  it('rejects setTheme — the standalone designer owns the theme preference', async () => {
    const handle = mountStandalone()

    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(0)
    })

    expect(() => handle.setTheme('dark')).toThrow(/owns the theme preference/i)
  })
})
