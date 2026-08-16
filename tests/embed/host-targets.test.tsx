/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostTarget, MountHandle } from '../../src/embed'
import { createStandaloneHost } from '../../src/embed/standaloneHost'

/**
 * Targets seam (issue #106, ADR-018): the host pushes the displays it knows
 * about — `{ id, label, capabilities }`, the id opaque — and the designer
 * renders a display picker inside its own display-config area, wired to the
 * existing lock UX (issue #70). What an embedding host can observe:
 *
 *  - one picker entry per pushed target, plus the "Virtual display" (unlock)
 *    entry, and no picker chrome at all when no targets are pushed;
 *  - selecting a target adopts its capabilities and locks the display config;
 *  - "Virtual display" unlocks; re-locking returns to the selected target;
 *  - `onTargetSelected(id | null)` reporting the selection, and
 *    `onAction(..., { targetId })` carrying the same id;
 *  - hot updates (`setTargets`) adding displays without a reload;
 *  - a push that removes the selected display keeping its last-known config
 *    and marking the selection stale, never switching or unlocking;
 *  - malformed pushes rejected loudly, leaving the designer untouched.
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

const PAYLOAD = ['- type: text', '  value: hello', '  x: 10', '  y: 10', ''].join('\n')

const KITCHEN: HostTarget = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  capabilities: { render_width: 296, render_height: 128, color_scheme: 0x01 },
}
const OFFICE: HostTarget = {
  id: 'display.office',
  label: 'Office display',
  capabilities: { render_width: 400, render_height: 300, color_scheme: 0x00 },
}
const HALLWAY: HostTarget = {
  id: 'display.hallway',
  label: 'Hallway 7.5"',
  capabilities: { render_width: 800, render_height: 480, color_scheme: 0x03 },
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

/** The display picker — the targets seam's only chrome. */
function picker(): HTMLSelectElement {
  return designer().getByLabelText('Display') as HTMLSelectElement
}

function optionLabels(): string[] {
  return Array.from(picker().options, (option) => option.textContent ?? '')
}

function selectDisplay(label: string): void {
  const option = Array.from(picker().options).find((entry) => entry.textContent === label)
  if (!option) {
    throw new Error(`no display option labelled ${JSON.stringify(label)} — have ${optionLabels().join(', ')}`)
  }
  fireEvent.change(picker(), { target: { value: option.value } })
}

function resolution(): HTMLElement {
  return designer().getByLabelText('Resolution')
}

function colorMode(): HTMLElement {
  return designer().getByLabelText('Color mode')
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

describe('host targets (issue #106)', () => {
  it('renders no display picker when the host pushes no targets', () => {
    mountDesigner({ payload: PAYLOAD, capabilities: { render_width: 296, render_height: 128 } })

    expect(designer().queryByLabelText('Display')).toBeNull()
    // The rest of the display-config area is untouched.
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
  })

  it('offers one entry per pushed target plus the virtual-display entry, selecting none', () => {
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })

    expect(optionLabels()).toEqual(['Kitchen tag', 'Office display', 'Virtual display'])
    // Nothing is adopted until the user picks: no host display, no lock, and
    // the display config controls stay enabled (1.x keeps `capabilities` as
    // the way to seed a display).
    expect(picker()).toHaveValue('')
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(resolution()).toBeEnabled()
    expect(colorMode()).toBeEnabled()
  })

  it('selecting a target adopts its capabilities and locks the display config', () => {
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })

    selectDisplay('Office display')

    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(colorMode()).toHaveValue('bw')
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(resolution()).toBeDisabled()
    expect(colorMode()).toBeDisabled()
  })

  it('reports the selection to the host, including the virtual display', () => {
    const onTargetSelected = vi.fn()
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE], onTargetSelected })

    expect(onTargetSelected).not.toHaveBeenCalled()

    selectDisplay('Kitchen tag')
    expect(onTargetSelected.mock.calls).toEqual([['display.kitchen']])

    selectDisplay('Virtual display')
    expect(onTargetSelected.mock.calls).toEqual([['display.kitchen'], [null]])
    expect(colorMode()).toBeEnabled()
  })

  it('unlocking is the virtual display; re-locking returns to the selected target', () => {
    const onTargetSelected = vi.fn()
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE], onTargetSelected })

    selectDisplay('Office display')
    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    expect(picker()).toHaveValue('')
    fireEvent.change(colorMode(), { target: { value: 'bwr' } })
    expect(colorMode()).toHaveValue('bwr')

    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))

    // The selection was remembered while unlocked: re-locking restores the
    // selected target's values and shows it in the picker again.
    expect(colorMode()).toHaveValue('bw')
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
    expect(onTargetSelected.mock.calls).toEqual([
      ['display.office'],
      [null],
      ['display.office'],
    ])
  })

  it('carries the selected target id into onAction', () => {
    const onAction = vi.fn()
    mountDesigner({
      payload: PAYLOAD,
      targets: [KITCHEN, OFFICE],
      actions: [{ id: 'send', label: 'Send to display' }],
      onAction,
    })

    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[0]?.[2]).toEqual({ targetId: undefined })

    selectDisplay('Kitchen tag')
    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[1]?.[2]).toEqual({ targetId: 'display.kitchen' })

    // A virtual display is not a target: the host is told there is none,
    // exactly as `onTargetSelected(null)` reported.
    selectDisplay('Virtual display')
    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[2]?.[2]).toEqual({ targetId: undefined })
  })

  it('adds a display pushed after mount without a reload, keeping the selection', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setTargets([KITCHEN, OFFICE, HALLWAY]))

    expect(optionLabels()).toEqual([
      'Kitchen tag',
      'Office display',
      'Hallway 7.5"',
      'Virtual display',
    ])
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
  })

  it('keeps the last-known config and marks the selection stale when it disappears', () => {
    const onTargetSelected = vi.fn()
    const handle = mountDesigner({
      payload: PAYLOAD,
      targets: [KITCHEN, OFFICE],
      onTargetSelected,
    })
    selectDisplay('Office display')
    onTargetSelected.mockClear()

    act(() => handle.setTargets([KITCHEN]))

    // Kept: the canvas, the lock, and the selection itself.
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(colorMode()).toHaveValue('bw')
    expect(colorMode()).toBeDisabled()
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    // Marked stale, visibly, and the remaining displays stay pickable.
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')
    expect(optionLabels()).toEqual([
      'Office display (unavailable)',
      'Kitchen tag',
      'Virtual display',
    ])
    expect(
      designer().getByRole('status', { name: 'Display no longer available' }),
    ).toBeInTheDocument()
    // Never silently switched or unlocked — so the host was told nothing new.
    expect(onTargetSelected).not.toHaveBeenCalled()
  })

  it('clears the stale marker when the host pushes the display back', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setTargets([KITCHEN]))
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')

    act(() => handle.setTargets([KITCHEN, OFFICE]))

    expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
    expect(designer().queryByRole('status', { name: 'Display no longer available' })).toBeNull()
  })

  it('marks the selection stale only while the design is pinned to it', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')
    act(() => handle.setTargets([KITCHEN]))

    // Unlocking is the virtual display: the design is pinned to nothing, so
    // there is no missing display to warn about — only what the host still has.
    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    expect(optionLabels()).toEqual(['Kitchen tag', 'Virtual display'])
    expect(picker()).toHaveValue('')
    expect(designer().queryByRole('status', { name: 'Display no longer available' })).toBeNull()

    // Re-locking returns to the missing display, and says so again.
    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')
    expect(
      designer().getByRole('status', { name: 'Display no longer available' }),
    ).toBeInTheDocument()
  })

  it('keeps the stale entry pickable-away after the whole list is cleared', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setTargets([]))

    expect(optionLabels()).toEqual(['Office display (unavailable)', 'Virtual display'])
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
  })

  it('treats a bare capabilities push as an anonymous display, clearing the selection', () => {
    // Precedence (ADR-018 amendment): `capabilities` is an unnamed display
    // push — today's semantics untouched — so it wins over, rather than
    // merges with, a named selection.
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setCapabilities({ render_width: 296, render_height: 128, color_scheme: 0x01 }))

    expect(resolution()).toHaveTextContent(/296\s*×\s*128/)
    expect(picker().selectedOptions[0]?.textContent).toBe('Host display')
    expect(optionLabels()).toEqual([
      'Host display',
      'Kitchen tag',
      'Office display',
      'Virtual display',
    ])
  })

  it('applies a targets push made before the designer has committed anything', () => {
    // Pre-registration window: the push queues and drains during the commit,
    // so the first frame a host can observe already carries it — and it wins
    // over the mount option, which is itself defined as an initial push.
    let handle!: MountHandle
    act(() => {
      handle = mount(container, { payload: PAYLOAD, targets: [KITCHEN] })
      handle.setTargets([OFFICE, HALLWAY])
    })
    handles.push(handle)

    expect(optionLabels()).toEqual(['Office display', 'Hallway 7.5"', 'Virtual display'])
  })

  it('offers no targets channel to the standalone app', () => {
    const standalone = createStandaloneHost()
    expect(standalone.targets).toBeUndefined()
    expect(standalone.onTargetSelected).toBeUndefined()
  })

  it('rejects a malformed targets list loudly, at the push that carries it', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN] })

    expect(() => handle.setTargets([KITCHEN, { ...KITCHEN, label: 'Copy' }])).toThrow(/duplicate/i)
    expect(() => handle.setTargets([{ ...KITCHEN, id: '  ' }])).toThrow(/id/i)
    expect(() => handle.setTargets([{ ...KITCHEN, label: '' }])).toThrow(/label/i)
    expect(() =>
      handle.setTargets([{ id: 'a', label: 'A' } as unknown as HostTarget]),
    ).toThrow(/capabilities/i)
    expect(() =>
      handle.setTargets({ length: 1 } as unknown as readonly HostTarget[]),
    ).toThrow(/array/i)
    // A sparse array: `map` skips its holes, so a hole that survives
    // validation renders as an entry that selects nothing at all.
    expect(() => handle.setTargets(new Array<HostTarget>(1))).toThrow(/entry 0/i)

    // The rejected pushes changed nothing.
    expect(optionLabels()).toEqual(['Kitchen tag', 'Virtual display'])
  })

  it('rejects malformed mount targets before touching the container', () => {
    expect(() => mount(container, { targets: [KITCHEN, { ...KITCHEN }] })).toThrow(/duplicate/i)

    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('rejects setTargets on a destroyed mount', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN] })
    act(() => handle.destroy())

    expect(() => handle.setTargets([OFFICE])).toThrow(/after destroy/i)
  })

  it('trims host text and keeps the host from mutating a pushed target', () => {
    const mutable: HostTarget = {
      id: '  display.office  ',
      label: '  Office display  ',
      capabilities: { render_width: 400, render_height: 300, color_scheme: 0x00 },
    }
    const onTargetSelected = vi.fn()
    mountDesigner({ payload: PAYLOAD, targets: [mutable], onTargetSelected })

    // Mutating the object the host still holds must not reach the designer.
    mutable.label = 'Renamed behind the designer'
    mutable.capabilities.render_width = 9999

    expect(optionLabels()).toEqual(['Office display', 'Virtual display'])
    selectDisplay('Office display')
    expect(onTargetSelected.mock.calls).toEqual([['display.office']])
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
  })
})
