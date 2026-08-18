/** @vitest-environment jsdom */
import { act } from 'react'
import { within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'

/**
 * `setStates()` validates at the push boundary (maintainer ruling 2026-08-17),
 * exactly like `setActions()` / `setTargets()`.
 *
 * The reviewer's wedge repro: a push carrying a malformed `name` used to latch
 * "this host feeds states" and retain the bad object as the last-applied push
 * *before* the conversion that then threw — so the designer was left with the
 * Simulator off, and an identical re-push (the natural thing a ticking host
 * does) was silently deduped as "unchanged" instead of failing again. A
 * rejected push must change **nothing** — no latch, no retained reference, no
 * mocks — so it stays re-pushable and the host can recover by correcting it.
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

const PAYLOAD = [
  '- type: text',
  "  value: \"{{ states('sensor.demo_temperature') }}\"",
  '  x: 10',
  '  y: 10',
  '',
].join('\n')

const BAD_NAME_PUSH = {
  'sensor.demo_temperature': { state: '21.5', name: 42 },
} as never

let container: HTMLElement
const handles: MountHandle[] = []

function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
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
  container = document.body.appendChild(document.createElement('div'))
})

afterEach(() => {
  for (const handle of handles.splice(0)) {
    act(() => {
      handle.destroy()
    })
  }
  container.remove()
  vi.unstubAllGlobals()
})

function mountDesigner(options: Parameters<typeof mount>[1] = {}): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

describe('setStates() push-boundary validation (issue #107 review)', () => {
  it('rejects a malformed push, changes nothing, throws again on a re-push, and applies the correction', () => {
    const handle = mountDesigner({ payload: PAYLOAD })

    // The designer owns its states until a *valid* push says otherwise.
    expect(designer().getByRole('button', { name: 'Simulator' })).toBeInTheDocument()

    expect(() => {
      act(() => {
        handle.setStates(BAD_NAME_PUSH)
      })
    }).toThrow(/Invalid host states:.*sensor\.demo_temperature.*name/)

    // Nothing moved: no host-fed latch, so the Simulator is still the designer's.
    expect(designer().getByRole('button', { name: 'Simulator' })).toBeInTheDocument()
    expect(designer().queryByRole('button', { name: 'States' })).toBeNull()

    // The identical re-push must fail identically — a rejected push is not a
    // "last applied" push, so the diff has nothing to dedupe against.
    expect(() => {
      act(() => {
        handle.setStates(BAD_NAME_PUSH)
      })
    }).toThrow(/Invalid host states:.*sensor\.demo_temperature.*name/)

    // ...and the corrected push lands, from a designer that was never wedged.
    act(() => {
      handle.setStates({
        'sensor.demo_temperature': { state: '21.5', name: 'Living-room temperature' },
      })
    })

    act(() => {
      designer().getByRole('button', { name: 'States' }).click()
    })
    expect(designer().getByTestId('referenced-states-panel')).toBeInTheDocument()
    expect(designer().getByText('Living-room temperature')).toBeInTheDocument()
  })

  it('rejects a malformed `states` mount option out of mount() itself, leaving the container untouched', () => {
    expect(() =>
      mount(container, { payload: PAYLOAD, states: BAD_NAME_PUSH }),
    ).toThrow(/Invalid host states:.*sensor\.demo_temperature.*name/)

    // Same contract as invalid `payload` YAML and a malformed `actions` list:
    // the host gets its container back exactly as it handed it over.
    expect(container.shadowRoot).toBeNull()
    expect(container.childNodes).toHaveLength(0)
  })

  it('keeps a valid push working after a rejected one, values and all', () => {
    const handle = mountDesigner({
      payload: PAYLOAD,
      states: { 'sensor.demo_temperature': '21.5' },
    })

    expect(() => {
      act(() => {
        handle.setStates({ 'sensor.demo_temperature': { state: '3.2', attributes: [] } } as never)
      })
    }).toThrow(/Invalid host states:.*sensor\.demo_temperature.*attributes/)

    act(() => {
      designer().getByRole('button', { name: 'States' }).click()
    })
    // The rejected push left the previous value on screen, not a half-applied one.
    expect(
      designer().getByTestId('referenced-state-row-sensor.demo_temperature'),
    ).toHaveTextContent('21.5')

    act(() => {
      handle.setStates({ 'sensor.demo_temperature': '3.2' })
    })
    expect(
      designer().getByTestId('referenced-state-row-sensor.demo_temperature'),
    ).toHaveTextContent('3.2')
  })
})
