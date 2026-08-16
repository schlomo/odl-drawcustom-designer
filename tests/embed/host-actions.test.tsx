/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostAction, MountHandle } from '../../src/embed'
import { createStandaloneHost } from '../../src/embed/standaloneHost'
import { TOOLBAR_TOOLTIP_SHOW_DELAY_MS } from '../../src/ui/lib/toolbar-tooltip'

/**
 * Host-registered actions (issue #108, ADR-018 actions seam): the host pushes
 * a typed, closed list of buttons; the designer renders them in its own
 * chrome and reports back which one fired, with the current payload. What an
 * embedding host can observe:
 *
 *  - a button per action, labelled by the host, in the designer's toolbar;
 *  - severity chrome (normal / caution / danger) visibly distinct;
 *  - a disabled action stating its reason through the toolbar tooltip;
 *  - `onAction(id, payload, context)` carrying exactly the payload
 *    `getPayload()` would return at that instant;
 *  - re-pushes (`setActions`) updating labels and reasons live;
 *  - a push made before the first commit landing in the first frame;
 *  - nothing at all rendered when no actions are pushed.
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

const SEND: HostAction = {
  id: 'send',
  label: 'Send to display',
  icon: 'send',
  severity: 'caution',
}
const VALIDATE: HostAction = { id: 'validate', label: 'Validate' }

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

function actionButton(name: string): HTMLButtonElement {
  return designer().getByRole('button', { name }) as HTMLButtonElement
}

/** The tooltip bubble the toolbar pattern renders next to a button. */
function tooltipFor(name: string): HTMLElement {
  const wrapper = actionButton(name).parentElement
  if (wrapper == null) {
    throw new Error(`missing tooltip wrapper for ${name}`)
  }
  const tooltip = wrapper.querySelector('[role="tooltip"]')
  if (tooltip == null) {
    throw new Error(`no tooltip rendered for ${name}`)
  }
  return tooltip as HTMLElement
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

afterEach(() => {
  vi.useRealTimers()
})

describe('host actions (issue #108)', () => {
  it('renders one button per pushed action in the designer chrome', () => {
    mountDesigner({ payload: PAYLOAD, actions: [SEND, VALIDATE] })

    expect(actionButton('Send to display')).toBeInTheDocument()
    expect(actionButton('Validate')).toBeInTheDocument()
    expect(actionButton('Send to display')).toBeEnabled()
  })

  it('paints caution and danger actions in visibly different chrome from a normal one', () => {
    // Severity is a *visual* contract (orange / red / regular). jsdom has no
    // compiled Tailwind, so the observable proxy is which theme palette token
    // each button's surface resolves against — the same variables that paint
    // it in both themes (index.css). Real painted colour is asserted in
    // tests/e2e/embed-actions.spec.ts.
    mountDesigner({
      payload: PAYLOAD,
      actions: [
        VALIDATE,
        SEND,
        { id: 'wipe', label: 'Wipe display', severity: 'danger' },
      ],
    })

    expect(actionButton('Validate').className).toContain('--shell-surface-2')
    expect(actionButton('Validate').className).not.toContain('--shell-warning')
    expect(actionButton('Validate').className).not.toContain('--shell-danger')

    expect(actionButton('Send to display').className).toContain('--shell-warning-border')
    expect(actionButton('Send to display').className).toContain('--shell-warning-fg')

    expect(actionButton('Wipe display').className).toContain('--shell-danger-border')
    expect(actionButton('Wipe display').className).toContain('--shell-danger')
  })

  it('hands the host the action id and exactly the payload getPayload() reports', () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: [SEND], onAction })

    fireEvent.click(actionButton('Send to display'))

    expect(onAction).toHaveBeenCalledTimes(1)
    const [id, payload, context] = onAction.mock.calls[0] as [string, string, { targetId?: string }]
    expect(id).toBe('send')
    expect(payload).toBe(handle.getPayload())
    expect(payload).toContain("states('sensor.demo_temperature')")
    // Reserved for the targets seam (#106) — typed today, always absent.
    expect(context.targetId).toBeUndefined()
  })

  it('renders a host-disabled action as disabled and states the reason on hover', () => {
    vi.useFakeTimers()
    const onAction = vi.fn()
    mountDesigner({
      payload: PAYLOAD,
      actions: [{ ...SEND, disabledReason: 'No display selected' }],
      onAction,
    })

    const button = actionButton('Send to display')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()

    const tooltip = tooltipFor('Send to display')
    expect(tooltip).toHaveTextContent('No display selected')
    expect(tooltip).toHaveClass('hidden')

    fireEvent.mouseEnter(button.parentElement!)
    act(() => {
      vi.advanceTimersByTime(TOOLBAR_TOOLTIP_SHOW_DELAY_MS)
    })
    expect(tooltip).toHaveClass('visible')
  })

  it('re-pushing the action list updates labels and reasons in the same tick', () => {
    // Host pushes land in the tick they are made (docs/testing.md) — assert
    // directly; a waitFor here would trade a guarantee for a timing race.
    const handle = mountDesigner({ payload: PAYLOAD, actions: [SEND] })
    expect(actionButton('Send to display')).toBeEnabled()

    act(() =>
      handle.setActions([
        { ...SEND, label: 'Send to Kitchen tag', disabledReason: 'Display offline' },
      ]),
    )

    expect(designer().queryByRole('button', { name: 'Send to display' })).toBeNull()
    expect(actionButton('Send to Kitchen tag')).toBeDisabled()
    expect(tooltipFor('Send to Kitchen tag')).toHaveTextContent('Display offline')

    act(() => handle.setActions([]))
    expect(designer().queryByRole('button', { name: 'Send to Kitchen tag' })).toBeNull()
  })

  it('applies an actions push made before the designer has committed anything', () => {
    // Pre-registration window: the push queues and drains during the commit,
    // so the first frame a host can observe already carries it — and it wins
    // over the mount option, which is itself defined as an initial push.
    let handle!: MountHandle
    act(() => {
      handle = mount(container, { payload: PAYLOAD, actions: [VALIDATE] })
      handle.setActions([SEND])
    })
    handles.push(handle)

    expect(actionButton('Send to display')).toBeInTheDocument()
    expect(designer().queryByRole('button', { name: 'Validate' })).toBeNull()
  })

  it('renders no action chrome when the host pushes none', () => {
    mountDesigner({ payload: PAYLOAD, onSaveRequest: () => {} })

    expect(designer().queryByRole('group', { name: 'Actions' })).toBeNull()
    // The built-in Save button is untouched by this seam (removal is 2.0, #121).
    expect(designer().getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('offers no action channel to the standalone app', () => {
    const standalone = createStandaloneHost()
    expect(standalone.actions).toBeUndefined()
    expect(standalone.onAction).toBeUndefined()
  })

  it('rejects a malformed action list loudly, at the push that carries it', () => {
    const handle = mountDesigner({ payload: PAYLOAD, actions: [SEND] })

    expect(() => handle.setActions([{ id: 'send', label: 'A' }, { id: 'send', label: 'B' }])).toThrow(
      /duplicate/i,
    )
    expect(() => handle.setActions([{ id: '', label: 'A' }])).toThrow(/id/i)
    expect(() => handle.setActions([{ id: 'a', label: '' }])).toThrow(/label/i)
    expect(() =>
      handle.setActions([{ id: 'a', label: 'A', icon: 'rocket' as HostAction['icon'] }]),
    ).toThrow(/icon/i)
    expect(() =>
      handle.setActions([
        { id: 'a', label: 'A', severity: 'urgent' as HostAction['severity'] },
      ]),
    ).toThrow(/severity/i)

    // The rejected pushes changed nothing.
    expect(actionButton('Send to display')).toBeInTheDocument()
  })

  it('rejects malformed mount actions before touching the container', () => {
    expect(() => mount(container, { actions: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })).toThrow(
      /duplicate/i,
    )

    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('rejects setActions on a destroyed mount', () => {
    const handle = mountDesigner({ payload: PAYLOAD, actions: [SEND] })
    act(() => handle.destroy())

    expect(() => handle.setActions([VALIDATE])).toThrow(/after destroy/i)
  })
})
