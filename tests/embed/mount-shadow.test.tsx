/** @vitest-environment jsdom */
import { act } from 'react'
import { waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'

/**
 * Style isolation via Shadow DOM at the mount boundary (issue #21): mount()
 * renders into an open shadow root on the container — created by mount() or
 * pre-attached by the host (the OpenDisplay HA panel pattern) — and injects
 * the compiled stylesheet there instead of into the host document's <head>.
 * Theme stays per-instance on the designer's own wrapper inside the shadow.
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

const handles: MountHandle[] = []

function mountInto(
  container: HTMLElement,
  options: Parameters<typeof mount>[1] = {},
): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

function shadowQueries(container: HTMLElement) {
  const shadow = container.shadowRoot
  expect(shadow).not.toBeNull()
  return within(shadow as unknown as HTMLElement)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  document.head.querySelectorAll('style[data-odl-designer-styles]').forEach((el) => el.remove())
  document.body.innerHTML = ''
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

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

describe('mount shadow boundary (issue #21)', () => {
  it('renders the designer inside an open shadow root on the container', async () => {
    const container = createContainer()
    mountInto(container, { payload: PAYLOAD, states: { 'sensor.demo_temperature': '21.5' } })

    expect(container.shadowRoot).not.toBeNull()
    expect(container.shadowRoot!.mode ?? 'open').toBe('open')

    await waitFor(() => {
      const rows = shadowQueries(container).getAllByTestId('element-list-row')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toHaveTextContent('21.5')
    })

    // Nothing rendered into the host-visible light DOM of the container.
    expect(container.querySelector('[data-testid="element-list-row"]')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('injects the compiled stylesheet into the shadow root, never into document.head', () => {
    const container = createContainer()
    mountInto(container, { payload: PAYLOAD })

    // (Vitest serves CSS ?inline imports as empty strings, so the sheet's
    // *content* — variables actually styling the tree — is asserted by the
    // Playwright isolation suite against the real library bundle.)
    const shadowStyle = container.shadowRoot!.querySelector('style[data-odl-designer-styles]')
    expect(shadowStyle).not.toBeNull()
    expect(document.head.querySelector('style[data-odl-designer-styles]')).toBeNull()
  })

  it('reuses a shadow root the host already attached (HA custom-element pattern)', async () => {
    const container = createContainer()
    const hostShadow = container.attachShadow({ mode: 'open' })

    mountInto(container, { payload: PAYLOAD, states: { 'sensor.demo_temperature': '21.5' } })

    expect(container.shadowRoot).toBe(hostShadow)
    await waitFor(() => {
      expect(shadowQueries(container).getAllByTestId('element-list-row')).toHaveLength(1)
    })
  })

  it('scopes dark/light per instance: two mounts with different themes coexist', () => {
    const containerA = createContainer()
    const containerB = createContainer()
    const handleA = mountInto(containerA, { payload: PAYLOAD, theme: 'light' })
    mountInto(containerB, { payload: PAYLOAD, theme: 'dark' })

    expect(containerA.shadowRoot!.querySelector('.dark')).toBeNull()
    expect(containerB.shadowRoot!.querySelector('.dark')).not.toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => handleA.setTheme('dark'))
    expect(containerA.shadowRoot!.querySelector('.dark')).not.toBeNull()
    expect(containerB.shadowRoot!.querySelector('.dark')).not.toBeNull()

    act(() => handleA.setTheme('light'))
    expect(containerA.shadowRoot!.querySelector('.dark')).toBeNull()
    expect(containerB.shadowRoot!.querySelector('.dark')).not.toBeNull()
  })

  it('destroy removes the designer from the shadow root and leaves the host light DOM untouched', () => {
    const container = createContainer()
    const marker = document.createElement('span')
    marker.textContent = 'host marker'
    document.body.appendChild(marker)

    const handle = mountInto(container, { payload: PAYLOAD })
    const wrapper = container.shadowRoot!.querySelector('[data-odl-designer-root]')
    expect(wrapper).not.toBeNull()

    act(() => handle.destroy())

    expect(container.shadowRoot!.querySelector('[data-odl-designer-root]')).toBeNull()
    expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).toBeNull()
    expect(wrapper!.isConnected).toBe(false)
    // The stylesheet intentionally stays for future mounts into the same root.
    expect(container.shadowRoot!.querySelector('style[data-odl-designer-styles]')).not.toBeNull()
    expect(marker.isConnected).toBe(true)
  })
})
