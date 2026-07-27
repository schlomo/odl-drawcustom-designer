/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'

/**
 * Display config lock (issue #70): when the host defines the display via
 * `capabilities`, the display config controls (resolution / rotation / color
 * mode) are host-owned — disabled behind a lock, unlockable as a "virtual
 * display" escape hatch, and Load Demo keeps the host display while locked.
 * Standalone-style mounts without capabilities show no lock at all.
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

const CAPABILITIES_296X128_BWR = {
  pixel_width: 296,
  pixel_height: 128,
  rotation_degrees: 0,
  color_scheme: 0x01,
}

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

describe('display config lock (issue #70)', () => {
  it('capabilities at mount lock the display config controls behind a lock icon', () => {
    mountDesigner({ capabilities: CAPABILITIES_296X128_BWR })

    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(designer().getByLabelText('Resolution')).toBeDisabled()
    expect(designer().getByLabelText('Color mode')).toBeDisabled()
    expect(designer().getByRole('button', { name: '90°' })).toBeDisabled()
  })

  it('a later setCapabilities push locks the display config', () => {
    const handle = mountDesigner({})

    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()

    act(() => handle.setCapabilities(CAPABILITIES_296X128_BWR))

    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(designer().getByLabelText('Resolution')).toBeDisabled()
  })

  it('without capabilities there is no lock and the controls stay enabled', () => {
    mountDesigner({})

    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(designer().queryByRole('button', { name: 'Lock display config' })).toBeNull()
    expect(designer().getByLabelText('Resolution')).toBeEnabled()
    expect(designer().getByLabelText('Color mode')).toBeEnabled()
    expect(designer().getByRole('button', { name: '90°' })).toBeEnabled()
  })

  it('unlock enables manual changes; re-lock restores the host-pushed values', () => {
    mountDesigner({ capabilities: CAPABILITIES_296X128_BWR })

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    const colorMode = designer().getByLabelText('Color mode')
    expect(colorMode).toBeEnabled()
    fireEvent.change(colorMode, { target: { value: 'bw' } })
    expect(colorMode).toHaveValue('bw')

    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))

    expect(designer().getByLabelText('Color mode')).toHaveValue('bwr')
    expect(designer().getByLabelText('Resolution')).toHaveTextContent(/296\s*×\s*128/)
    expect(designer().getByLabelText('Color mode')).toBeDisabled()
  })

  it('Load Demo while locked loads the demo payload but keeps the host display', async () => {
    mountDesigner({ capabilities: CAPABILITIES_296X128_BWR })

    fireEvent.click(designer().getByRole('button', { name: 'Load Demo' }))

    // Demo payload landed…
    await waitFor(() => {
      expect(designer().getAllByTestId('element-list-row').length).toBeGreaterThan(3)
    })
    // …but the host display survives (showcase canvas is 800×480 four-color).
    expect(designer().getByLabelText('Resolution')).toHaveTextContent(/296\s*×\s*128/)
    expect(designer().getByLabelText('Color mode')).toHaveValue('bwr')
  })

  it('Load Demo while unlocked applies the showcase display config', async () => {
    mountDesigner({ capabilities: CAPABILITIES_296X128_BWR })

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
    fireEvent.click(designer().getByRole('button', { name: 'Load Demo' }))

    await waitFor(() => {
      expect(designer().getByLabelText('Resolution')).toHaveTextContent(/800\s*×\s*480/)
    })
    expect(designer().getByLabelText('Color mode')).toHaveValue('four')
  })
})
