/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostTarget, MountHandle } from '../../src/embed'
import { createStandaloneHost } from '../../src/embed/standaloneHost'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Targets seam (issue #106, ADR-018): the host pushes the displays it knows
 * about — `{ id, label, display }`, the id opaque — and the designer
 * renders a display picker inside its own display-config area, wired to the
 * existing lock UX (issue #70). At 2.0 this is the *only* display channel
 * (issue #121). What an embedding host can observe:
 *
 *  - one picker entry per pushed target, plus the "Virtual display" (unlock)
 *    entry, and no picker chrome at all when no targets are pushed;
 *  - a one-element push adopted and locked with no pick, and never overriding a
 *    display choice the user already made;
 *  - selecting a target adopts its display spec and locks the display config;
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
  display: { renderWidth: 296, renderHeight: 128, colorScheme: 0x01 },
}
const OFFICE: HostTarget = {
  id: 'display.office',
  label: 'Office display',
  display: { renderWidth: 400, renderHeight: 300, colorScheme: 0x00 },
}
const HALLWAY: HostTarget = {
  id: 'display.hallway',
  label: 'Hallway 7.5"',
  display: { renderWidth: 800, renderHeight: 480, colorScheme: 0x03 },
}

/** A rectangle whose `fill: red` paints the layer-row swatch — the palette probe. */
const RED_RECTANGLE_PAYLOAD = [
  '- type: rectangle',
  '  x_start: 0',
  '  y_start: 0',
  '  x_end: 10',
  '  y_end: 10',
  '  fill: red',
  '',
].join('\n')

/** A display whose panel was measured: its red is nothing like `#ff0000`. */
const MEASURED_KITCHEN: HostTarget = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  display: {
    renderWidth: 296,
    renderHeight: 128,
    colorMap: { black: '#000000', white: '#ffffff', red: '#c81020' },
  },
}
/** Same size class, no measured palette at all. */
const UNMEASURED_HALLWAY: HostTarget = {
  id: 'display.hallway',
  label: 'Hallway 7.5"',
  display: { renderWidth: 800, renderHeight: 480, colorScheme: 0x01 },
}
/** Portrait by rotation, sized in physical pixels so the rotation is visible. */
const ROTATED_OFFICE: HostTarget = {
  id: 'display.office',
  label: 'Office display',
  display: { pixelWidth: 400, pixelHeight: 300, rotationDegrees: 90, colorScheme: 0x00 },
}
/** Declares no rotation — the canonical default (0°) is what it must get. */
const UPRIGHT_KITCHEN: HostTarget = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  display: { pixelWidth: 296, pixelHeight: 128, colorScheme: 0x01 },
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

/**
 * The stale-target warning — a `StatusHint` (`role="status"`). That role
 * takes its accessible name from aria-label/aria-labelledby only (issue
 * #150), never from content, so it is located by its live-region text
 * rather than an RTL accessible name.
 */
function staleTargetHint(): HTMLElement | null {
  const text = designer().queryByText(/Display no longer available/i)
  return text?.closest('[role="status"]') ?? null
}

/**
 * Which orientation button is active — the way round the adopted display is
 * held. The resolution control names a display by its *pair* of dimensions and
 * is orientation-insensitive by design (issue #139), so the two together are
 * what pins the adopted surface down: pair + orientation.
 */
function activeRotation(): string | null {
  const buttons = designer().getAllByRole('button', { name: /^\d+°$/ })
  return buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent ?? null
}

/**
 * The colour the first layer row's swatch actually paints — the adopted
 * palette, one step from the canvas (issue #68: swatches, preview and PNG
 * export share one palette source of truth).
 */
function layerSwatchFill(): string | null {
  const swatch = (container.shadowRoot as unknown as ParentNode).querySelector(
    '[data-testid="element-list-row"] svg rect',
  )
  return swatch?.getAttribute('fill') ?? null
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
    mountDesigner({ payload: PAYLOAD })

    expect(designer().queryByLabelText('Display')).toBeNull()
    // The rest of the display-config area is untouched: no host display means
    // no lock either (standalone behavior, unchanged).
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(resolution()).toBeEnabled()
  })

  it('offers one entry per pushed target plus the virtual-display entry, selecting none', () => {
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })

    expect(optionLabels()).toEqual(['Kitchen tag', 'Office display', 'Virtual display'])
    // A list the user can choose between adopts nothing until they pick: no
    // host display, no lock, controls enabled. (A one-element list is the
    // opposite case — see the auto-selection block below, issue #121.)
    expect(picker()).toHaveValue('')
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(resolution()).toBeEnabled()
    expect(colorMode()).toBeEnabled()
  })

  it('selecting a target adopts its display spec and locks the display config', () => {
    mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })

    selectDisplay('Office display')

    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(colorMode()).toHaveValue('bw')
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(resolution()).toBeDisabled()
    expect(colorMode()).toBeDisabled()
  })

  it('applies a picked display from the designer defaults, not from the one picked before', () => {
    // Canonical-base resolution (maintainer ruling 2026-08-16): the same
    // display must produce the same canvas whatever the user picked before it.
    // A merge onto the *current* canvas leaks the previous display's rotation
    // into a display that never declared one — 128×296 instead of 296×128.
    mountDesigner({ payload: PAYLOAD, targets: [ROTATED_OFFICE, UPRIGHT_KITCHEN] })

    selectDisplay('Office display')
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(activeRotation()).toBe('90°')

    selectDisplay('Kitchen tag')

    // Upright, as that display declares — not the previous display's quarter
    // turn inherited by a display that never mentioned one, which would leave
    // the 296×128 panel standing on end.
    expect(resolution()).toHaveTextContent(/296\s*×\s*128/)
    expect(activeRotation()).toBe('0°')
  })

  it('drops the previous display’s measured palette when the next declares none', () => {
    // Same ruling, ADR-007 parity: a display with no `colorMap` renders the
    // canonical palette. Inheriting the last display's measured hexes paints
    // one panel's red on another's — silently wrong on the tag.
    mountDesigner({
      payload: RED_RECTANGLE_PAYLOAD,
      targets: [MEASURED_KITCHEN, UNMEASURED_HALLWAY],
    })

    selectDisplay('Kitchen tag')
    expect(layerSwatchFill()?.toLowerCase()).toBe('#c81020')

    selectDisplay('Hallway 7.5"')

    expect(layerSwatchFill()).toBe('red')
  })

  it('re-applies the selected display when the host re-pushes it with a new display spec', () => {
    // The host re-defined the display the design is pinned to, so the designer
    // re-asserts it (maintainer ruling 2026-08-16). Stranding the canvas on the
    // old size while the picker shows the new label describes hardware that no
    // longer exists.
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)

    act(() =>
      handle.setTargets([
        KITCHEN,
        {
          ...OFFICE,
          label: 'Office display (resized)',
          display: { renderWidth: 800, renderHeight: 480, colorScheme: 0x01 },
        },
      ]),
    )

    expect(resolution()).toHaveTextContent(/800\s*×\s*480/)
    expect(colorMode()).toHaveValue('bwr')
    // Still locked onto it, still the selection.
    expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (resized)')
  })

  it('stores an updated selected display while unlocked, and re-locking applies it', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')
    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    act(() =>
      handle.setTargets([
        KITCHEN,
        { ...OFFICE, display: { renderWidth: 800, renderHeight: 480, colorScheme: 0x01 } },
      ]),
    )

    // Unlocked means the user owns the canvas: the push does not move it.
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)

    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))

    expect(resolution()).toHaveTextContent(/800\s*×\s*480/)
    expect(colorMode()).toHaveValue('bwr')
  })

  it('reports no target while the selection is missing from the host’s list', () => {
    // The designer never hands the host an id absent from the host's own list
    // (maintainer ruling 2026-08-16). The stale *label* stays on screen for
    // the user; the id reported to the host does not.
    const onTargetSelected = vi.fn()
    const onAction = vi.fn()
    const handle = mountDesigner({
      payload: PAYLOAD,
      targets: [KITCHEN, OFFICE],
      actions: [{ id: 'send', label: 'Send to display' }],
      onTargetSelected,
      onAction,
    })
    selectDisplay('Office display')
    onTargetSelected.mockClear()

    act(() => handle.setTargets([KITCHEN]))

    expect(onTargetSelected.mock.calls).toEqual([[null]])
    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ targetId: undefined }))
    // The user still sees which display the design is pinned to.
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')

    // Re-adding it heals the state: the id is reported again.
    act(() => handle.setTargets([KITCHEN, OFFICE]))
    expect(onTargetSelected.mock.calls).toEqual([[null], ['display.office']])
  })

  it('re-locking a stale selection keeps its display but still reports no target', () => {
    const onTargetSelected = vi.fn()
    const handle = mountDesigner({
      payload: PAYLOAD,
      targets: [KITCHEN, OFFICE],
      onTargetSelected,
    })
    selectDisplay('Office display')
    act(() => handle.setTargets([KITCHEN]))
    onTargetSelected.mockClear()

    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))

    // Last-known display spec comes back (existing ruling)…
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')
    // …but the host is never told an id it no longer offers.
    expect(onTargetSelected).not.toHaveBeenCalled()
  })

  it('keeps the picker while the host’s list is empty and a selection is remembered', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [OFFICE] })
    selectDisplay('Office display')
    fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))

    act(() => handle.setTargets([]))

    // The control the user was last using must not vanish from under them:
    // the virtual display is still a choice, and re-locking is still one click.
    expect(designer().queryByLabelText('Display')).not.toBeNull()
    expect(optionLabels()).toEqual(['Virtual display'])
  })

  it('treats a pick of a display the host has since removed as a no-op, not a choice', () => {
    // Mid-interaction race (maintainer ruling 2026-08-16): a native select
    // popup snapshots its options when it opens, so a push that removes a
    // display while it is open still lets the browser commit that display's id.
    // Nothing can be adopted for it — and because nothing is adopted, it is not
    // the user's display choice either: auto-adoption must still be live
    // afterwards, and the canvas must be untouched.
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    const staleOption = Array.from(picker().options).find(
      (option) => option.textContent === 'Office display',
    )!
    // A rotation of the user's own, to see that the no-op leaves it alone.
    fireEvent.click(designer().getByRole('button', { name: '90°' }))

    act(() => handle.setTargets([KITCHEN, HALLWAY]))
    // The still-open popup the user is choosing from — jsdom has no popup, so
    // the option React has already dropped is put back by hand; the change
    // event itself is the real one.
    picker().appendChild(staleOption)
    fireEvent.change(picker(), { target: { value: staleOption.value } })
    staleOption.remove()

    // Nothing adopted, nothing locked, rotation as the user left it.
    expect(picker()).toHaveValue('')
    expect(resolution()).toBeEnabled()
    expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    expect(activeRotation()).toBe('90°')

    // Still no display choice of the user's, so the host narrowing to one
    // display is still adopted and locked (issue #121).
    act(() => handle.setTargets([HALLWAY]))

    expect(picker().selectedOptions[0]?.textContent).toBe('Hallway 7.5"')
    expect(resolution()).toHaveTextContent(/800\s*×\s*480/)
    expect(resolution()).toBeDisabled()
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
    expect(onAction.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ targetId: undefined }))

    selectDisplay('Kitchen tag')
    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ targetId: 'display.kitchen' }))

    // A virtual display is not a target: the host is told there is none,
    // exactly as `onTargetSelected(null)` reported.
    selectDisplay('Virtual display')
    fireEvent.click(designer().getByRole('button', { name: 'Send to display' }))
    expect(onAction.mock.calls[2]?.[2]).toEqual(expect.objectContaining({ targetId: undefined }))
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
    const hint = staleTargetHint()
    expect(hint).not.toBeNull()
    // The recovery instruction must reach the live region's content, not
    // just its (nonexistent) accessible name — issue #150.
    expect(hint).toHaveTextContent(/pick another display to switch/i)
    // Never silently switched or unlocked. The host is told the id is no
    // longer in effect — it just dropped that display from its own list — but
    // exactly once, and the user keeps seeing which display this is.
    expect(onTargetSelected.mock.calls).toEqual([[null]])
  })

  it('clears the stale marker when the host pushes the display back', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setTargets([KITCHEN]))
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')

    act(() => handle.setTargets([KITCHEN, OFFICE]))

    expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
    expect(staleTargetHint()).toBeNull()
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
    expect(staleTargetHint()).toBeNull()

    // Re-locking returns to the missing display, and says so again.
    fireEvent.click(designer().getByRole('button', { name: 'Lock display config' }))
    expect(picker().selectedOptions[0]?.textContent).toBe('Office display (unavailable)')
    expect(staleTargetHint()).not.toBeNull()
  })

  it('keeps the stale entry pickable-away after the whole list is cleared', () => {
    const handle = mountDesigner({ payload: PAYLOAD, targets: [OFFICE] })
    selectDisplay('Office display')

    act(() => handle.setTargets([]))

    expect(optionLabels()).toEqual(['Office display (unavailable)', 'Virtual display'])
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
  })

  it('applies a targets push made before the designer has committed anything', () => {
    // Pre-registration window: the push queues and drains during the commit,
    // so the first frame a host can observe already carries it — and it wins
    // over the mount option, which is itself defined as an initial push.
    let handle!: MountHandle
    act(() => {
      handle = mount(container, { payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
      handle.setTargets([OFFICE, HALLWAY])
    })
    handles.push(handle)

    expect(optionLabels()).toEqual(['Office display', 'Hallway 7.5"', 'Virtual display'])
  })

  it('adopts a single-target push made before the designer has committed anything', () => {
    // Same window, the auto-adopting case (issue #121): the first observable
    // frame is already locked onto the pushed display — no frame of default,
    // unlocked config, which is the whole point issue #115 established for the
    // display channel.
    let handle!: MountHandle
    act(() => {
      handle = mount(container, { payload: PAYLOAD })
      handle.setTargets([OFFICE])
    })
    handles.push(handle)

    expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
    expect(resolution()).toBeDisabled()
  })

  /**
   * The 2.0 subsumption (issue #121): with the `capabilities`/`lock` channel
   * gone, a single-display host says so by pushing a one-element `targets`
   * list — the designer adopts and locks onto it, so the first frame is
   * already that display. Nothing else about pushes changes: a list the user
   * could actually choose between still selects nothing, and once the user has
   * chosen a display (a target, or the virtual display) no push ever overrides
   * that choice.
   */
  describe('single-target auto-selection (issue #121)', () => {
    it('adopts and locks the only display pushed at mount', () => {
      const onTargetSelected = vi.fn()
      mountDesigner({ payload: PAYLOAD, targets: [OFFICE], onTargetSelected })

      expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
      expect(colorMode()).toHaveValue('bw')
      expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
      expect(resolution()).toBeDisabled()
      expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
      // The display it is pinned to has a name — there is no anonymous
      // "Host display" entry left to fall back to.
      expect(optionLabels()).toEqual(['Office display', 'Virtual display'])
      // The host is told which display the designer put itself on.
      expect(onTargetSelected.mock.calls).toEqual([['display.office']])
    })

    it('adopts a single-target push made after mount, before the user chooses', () => {
      // Mount option ≡ initial push (ADR-018 seam grammar), so the push path
      // has to auto-select on exactly the same terms as the option above.
      const handle = mountDesigner({ payload: PAYLOAD })
      expect(designer().queryByLabelText('Display')).toBeNull()

      act(() => handle.setTargets([OFFICE]))

      expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
      expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
      expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
    })

    it('selects nothing when the host offers a choice', () => {
      mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })

      expect(picker()).toHaveValue('')
      expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
      expect(resolution()).toBeEnabled()
    })

    it('never overrides a user who picked the virtual display', () => {
      // A targets-pushing host re-pushes its inventory freely (on a timer, even):
      // a re-push that happens to narrow to one display must not drag the user
      // off the virtual display they deliberately chose.
      const handle = mountDesigner({ payload: PAYLOAD, targets: [KITCHEN, OFFICE] })
      selectDisplay('Virtual display')

      act(() => handle.setTargets([OFFICE]))

      expect(picker()).toHaveValue('')
      expect(resolution()).toBeEnabled()
      expect(designer().queryByRole('button', { name: 'Unlock display config' })).toBeNull()
    })

    it('never overrides a user who unlocked the auto-selected display', () => {
      const handle = mountDesigner({ payload: PAYLOAD, targets: [OFFICE] })
      fireEvent.click(designer().getByRole('button', { name: 'Unlock display config' }))
      fireEvent.change(colorMode(), { target: { value: 'bwr' } })

      act(() => handle.setTargets([OFFICE]))

      expect(colorMode()).toBeEnabled()
      expect(colorMode()).toHaveValue('bwr')
    })

    /**
     * The rule, verbatim (maintainer ruling 2026-08-16): *until the user makes
     * a display choice, the designer mirrors the host — one declared display =
     * adopted + locked, several = open picker.* Both interleavings of the mount
     * option and a later push are pinned below, because "mount option ≡ initial
     * push" (ADR-018 seam grammar) makes them the same statement made twice.
     */
    it('re-pins to a single display pushed after another was auto-adopted', () => {
      const onTargetSelected = vi.fn()
      const handle = mountDesigner({
        payload: PAYLOAD,
        targets: [KITCHEN],
        onTargetSelected,
      })
      expect(picker().selectedOptions[0]?.textContent).toBe('Kitchen tag')

      act(() => handle.setTargets([OFFICE]))

      // Mirroring the host: it now declares exactly one display, and that is
      // the display — the user never chose the one before it.
      expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
      expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
      expect(resolution()).toBeDisabled()
      expect(designer().getByRole('button', { name: 'Unlock display config' })).toBeInTheDocument()
      // Two changes in the design's life, so two notifications — no more.
      expect(onTargetSelected.mock.calls).toEqual([['display.kitchen'], ['display.office']])
    })

    it('adopts and locks a single display pushed after a multi-display mount', () => {
      const onTargetSelected = vi.fn()
      const handle = mountDesigner({
        payload: PAYLOAD,
        targets: [KITCHEN, OFFICE],
        onTargetSelected,
      })
      // A choice: nothing adopted, nothing reported.
      expect(picker()).toHaveValue('')
      expect(onTargetSelected).not.toHaveBeenCalled()

      act(() => handle.setTargets([OFFICE]))

      // The host narrowed to one display and the user had made no choice, so
      // the designer follows it.
      expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
      expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
      expect(colorMode()).toBeDisabled()
      expect(onTargetSelected.mock.calls).toEqual([['display.office']])
    })
  })

  /**
   * Re-entrancy of the push/notify cycle (maintainer ruling 2026-08-16).
   * Reacting to `onTargetSelected` with another `setTargets()` is a pattern the
   * contract teaches, so that push arrives while the notification it answers is
   * still in flight. It must be parked and applied after the cycle settles —
   * bounded, latest-push-wins, nothing dropped — never applied from inside the
   * notification it caused.
   */
  describe('a targets push made from inside onTargetSelected', () => {
    it('settles in bounded steps, with the pushed display adopted', () => {
      // Capped depth on purpose: a regression that re-enters the cycle fails
      // this test instead of hanging the whole suite.
      const NOTIFICATION_CAP = 8
      const reported: (string | null)[] = []
      let handle!: MountHandle
      act(() => {
        handle = mount(container, {
          payload: PAYLOAD,
          targets: [KITCHEN],
          onTargetSelected(id) {
            reported.push(id)
            if (reported.length > NOTIFICATION_CAP) {
              return
            }
            handle.setTargets([OFFICE])
          },
        })
      })
      handles.push(handle)

      expect(reported).toEqual(['display.kitchen', 'display.office'])
      expect(picker().selectedOptions[0]?.textContent).toBe('Office display')
      expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
      expect(resolution()).toBeDisabled()
    })

    it('applies only the last of several pushes made from one notification', () => {
      // Coalesced, latest wins: `setTargets()` replaces the whole list, so a
      // push the host superseded within the same turn has nothing left to say —
      // and must not move the canvas on its way past. Here the superseded push
      // is a one-element list, which is exactly the shape that would otherwise
      // be adopted and locked onto.
      const NOTIFICATION_CAP = 8
      const reported: (string | null)[] = []
      let handle!: MountHandle
      act(() => {
        handle = mount(container, {
          payload: PAYLOAD,
          targets: [KITCHEN],
          onTargetSelected(id) {
            reported.push(id)
            if (reported.length > NOTIFICATION_CAP) {
              return
            }
            handle.setTargets([OFFICE])
            handle.setTargets([OFFICE, HALLWAY])
          },
        })
      })
      handles.push(handle)

      // The host's last word is a two-display choice, so nothing is adopted by
      // it: the design stays on the display it was already pinned to, which
      // that list no longer offers (keep-and-mark-stale).
      expect(optionLabels()).toEqual([
        'Kitchen tag (unavailable)',
        'Office display',
        'Hallway 7.5"',
        'Virtual display',
      ])
      expect(resolution()).toHaveTextContent(/296\s*×\s*128/)
      expect(reported).toEqual(['display.kitchen', null])
    })
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
    ).toThrow(/display/i)
    expect(() =>
      handle.setTargets({ length: 1 } as unknown as readonly HostTarget[]),
    ).toThrow(/array/i)
    // A sparse array: `map` skips its holes, so a hole that survives
    // validation renders as an entry that selects nothing at all.
    expect(() => handle.setTargets(new Array<HostTarget>(1))).toThrow(/entry 0/i)
    // A non-iterable `availableColors` must fail with this module's own loud
    // message, not a bare "is not iterable" from the copy.
    expect(() =>
      handle.setTargets([
        {
          ...KITCHEN,
          display: { availableColors: 'red' as unknown as string[] },
        },
      ]),
    ).toThrow(/Invalid host targets: .*availableColors/i)

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
      display: { renderWidth: 400, renderHeight: 300, colorScheme: 0x00 },
    }
    const onTargetSelected = vi.fn()
    mountDesigner({ payload: PAYLOAD, targets: [mutable], onTargetSelected })

    // Mutating the object the host still holds must not reach the designer.
    mutable.label = 'Renamed behind the designer'
    mutable.display.renderWidth = 9999

    expect(optionLabels()).toEqual(['Office display', 'Virtual display'])
    selectDisplay('Office display')
    expect(onTargetSelected.mock.calls).toEqual([['display.office']])
    expect(resolution()).toHaveTextContent(/400\s*×\s*300/)
  })
})
