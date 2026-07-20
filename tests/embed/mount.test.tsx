/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import { readSessionFromDb } from '../../src/storage'

/**
 * Embeddable mount API (issue #20): behavior an embedding host observes —
 * render into an arbitrary container, container-scoped theme, host-pushed
 * states/capabilities, onSaveRequest, destroy. ADR-010: parent owns
 * persistence in embedded mode.
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

const PAYLOAD = [
  '- type: text',
  "  value: \"{{ states('sensor.demo_temperature') }}\"",
  '  x: 10',
  '  y: 10',
  '',
].join('\n')

let container: HTMLElement
const handles: MountHandle[] = []

function mountDesigner(options: Parameters<typeof mount>[1] = {}): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

/** The designer renders inside the container's shadow root (issue #21). */
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

describe('mount', () => {
  it('renders the designer with the initial payload and host states applied to template preview', async () => {
    mountDesigner({ payload: PAYLOAD, states: { 'sensor.demo_temperature': '21.5' } })

    await waitFor(() => {
      const rows = designer().getAllByTestId('element-list-row')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toHaveTextContent('21.5')
    })
  })

  it('scopes the theme to the mount container, never document.documentElement', () => {
    const handle = mountDesigner({ payload: PAYLOAD, theme: 'dark' })

    const themedRoot = container.shadowRoot!.querySelector('.dark')
    expect(themedRoot).not.toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.dataset.theme).toBeUndefined()

    act(() => handle.setTheme('light'))
    expect(container.shadowRoot!.querySelector('.dark')).toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setStates replaces the simulator mock source and re-evaluates template preview', async () => {
    const handle = mountDesigner({
      payload: PAYLOAD,
      states: { 'sensor.demo_temperature': '21.5' },
    })

    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('21.5')
    })

    act(() => handle.setStates({ 'sensor.demo_temperature': '3.2' }))

    await waitFor(() => {
      expect(designer().getByTestId('element-list-row')).toHaveTextContent('3.2')
    })
  })

  it('setCapabilities drives the canvas resolution', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })

    act(() =>
      handle.setCapabilities({
        pixel_width: 296,
        pixel_height: 128,
        rotation_degrees: 0,
        color_map: { black: '#000000', white: '#ffffff', red: '#ff0000' },
      }),
    )

    await waitFor(() => {
      expect(designer().getByLabelText('Resolution')).toHaveTextContent(/296\s*×\s*128/)
    })
  })

  it('Save requests hand the current payload YAML to the host; no share link is offered', () => {
    const onSaveRequest = vi.fn()
    mountDesigner({ payload: PAYLOAD, onSaveRequest })

    expect(designer().queryByLabelText('Copy share link')).toBeNull()

    fireEvent.click(designer().getByRole('button', { name: 'Save' }))

    expect(onSaveRequest).toHaveBeenCalledTimes(1)
    const saved = onSaveRequest.mock.calls[0]![0] as string
    expect(saved).toContain('type: text')
    expect(saved).toContain("states('sensor.demo_temperature')")
  })

  it('does not autosave the session locally — the parent owns persistence (ADR-010)', async () => {
    mountDesigner({ payload: PAYLOAD })

    // The standalone session autosave debounce is 250ms; wait past it.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))

    expect(await readSessionFromDb()).toBeNull()
  })

  it('destroy unmounts the designer and removes its DOM from the shadow root', () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    const shadow = container.shadowRoot!
    const wrapper = shadow.querySelector('[data-odl-designer-root]')
    expect(wrapper).not.toBeNull()

    act(() => handle.destroy())

    expect(shadow.querySelector('[data-odl-designer-root]')).toBeNull()
    expect(wrapper!.isConnected).toBe(false)
    // The host-visible light DOM of the container stays empty throughout.
    expect(container.childElementCount).toBe(0)
  })
})
