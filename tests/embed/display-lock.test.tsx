/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Display config lock (issue #70): when the design is pinned to a host display
 * — at 2.0 always a pushed `targets` entry (issue #121) — the display config
 * controls (resolution / color mode) are host-owned: disabled behind a lock,
 * unlockable as the "virtual display" escape hatch, and Load Demo keeps the
 * host display while locked. Mounts with no targets show no lock at all.
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

const OFFICE_400X300_BW = {
  id: 'display.office',
  label: 'Office display',
  capabilities: { render_width: 400, render_height: 300, color_scheme: 0x00 },
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
  it('the display pushed at mount locks the display config controls behind a lock icon', () => {
    mountDesigner({ targets: [KITCHEN_296X128_BWR] })

    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(designer().getByLabelText('Resolution')).toBeDisabled()
    expect(designer().getByLabelText('Color mode')).toBeDisabled()
    // Lock scope is dimensions + color mode/palette only (maintainer ruling
    // 2026-08-16): rotation is a user choice (portrait mounting) and stays
    // editable while locked.
    expect(designer().getByRole('button', { name: '90°' })).toBeEnabled()
  })

  it('a later single-target push locks the display config', () => {
    const handle = mountDesigner({})

    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()

    act(() => handle.setTargets([KITCHEN_296X128_BWR]))

    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(designer().getByLabelText('Resolution')).toBeDisabled()
  })

  it('without a host display there is no lock and the controls stay enabled', () => {
    mountDesigner({})

    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(designer().queryByRole('button', { name: 'Lock display config' })).toBeNull()
    expect(designer().getByLabelText('Resolution')).toBeEnabled()
    expect(designer().getByLabelText('Color mode')).toBeEnabled()
    expect(designer().getByRole('button', { name: '90°' })).toBeEnabled()
  })

  it('a list the user can choose between locks nothing until they pick', () => {
    mountDesigner({ targets: [KITCHEN_296X128_BWR, OFFICE_400X300_BW] })

    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(designer().getByLabelText('Resolution')).toBeEnabled()
    expect(designer().getByLabelText('Color mode')).toBeEnabled()
  })

  it('unlock enables manual changes; re-lock restores the host display values', () => {
    mountDesigner({ targets: [KITCHEN_296X128_BWR] })

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
    mountDesigner({ targets: [KITCHEN_296X128_BWR] })

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
    mountDesigner({ targets: [KITCHEN_296X128_BWR] })

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
    fireEvent.click(designer().getByRole('button', { name: 'Load Demo' }))

    await waitFor(() => {
      expect(designer().getByLabelText('Resolution')).toHaveTextContent(/800\s*×\s*480/)
    })
    expect(designer().getByLabelText('Color mode')).toHaveValue('four')
  })

  // The "virtual display" escape hatch is the lock's open state and nothing
  // else (issue #121 removed the `lock: false` seeding flag along with the
  // `capabilities` channel): a host hands the user a display, the user is one
  // click from leaving it, and one click from coming back.
  it('a user who unlocks owns the canvas; re-locking snaps back to the host display', () => {
    mountDesigner({ targets: [KITCHEN_296X128_BWR] })

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
    const colorMode = designer().getByLabelText('Color mode')
    expect(colorMode).toBeEnabled()
    fireEvent.change(colorMode, { target: { value: 'bw' } })
    expect(colorMode).toHaveValue('bw')

    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))

    expect(designer().getByLabelText('Color mode')).toHaveValue('bwr')
    expect(designer().getByLabelText('Color mode')).toBeDisabled()
    expect(designer().getByLabelText('Resolution')).toHaveTextContent(/296\s*×\s*128/)
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
  })
})
