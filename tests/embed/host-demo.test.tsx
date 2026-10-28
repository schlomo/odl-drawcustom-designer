/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostAction, HostActionContext, MountHandle, MountOptions } from '../../src/embed'
import { createEmbeddedHost } from '../../src/embed/embeddedHost'
import { createStandaloneHost } from '../../src/embed/standaloneHost'
import { parseYamlPayload, serializeYamlPayload } from '../../src/core'
import { buildAppBootstrap } from '../../src/ui/bootstrap/appBootstrap'
import {
  SHOWCASE_ELEMENTS,
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
} from '../../src/ui/data/showcase'
import { LOAD_DEMO_CONFIRM_MESSAGE } from '../../src/ui/lib/replace-confirm'
import { useProjectState } from '../../src/ui/hooks/useProjectState'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * `MountOptions.demo` (maintainer decision 2026-10-28): a host ships its own
 * Load Demo. The bundled showcase names states no real host has (a Home
 * Assistant install has no `sensor.temperature`), so inside a host the demo
 * rendered as "unknown" and a send to a real display failed. A host that
 * supplies `demo` gets its payload and variables loaded by the designer's
 * Load Demo button instead of the showcase's; everything else about Load Demo
 * under a host-fed adapter (payload only, states stay the host's, the replace
 * confirm) is unchanged. Without `demo` nothing changes at all.
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

const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

const HOST_DEMO_PAYLOAD = [
  '- type: text',
  '  value: "{{ states(\'sun.sun\') }} / {{ greeting }}"',
  '  x: 10',
  '  y: 10',
  '  color: "{{ accent }}"',
  '',
].join('\n')

const HOST_DEMO_VARIABLES = { greeting: 'Hello host', accent: 'red' }

const HOST_DEMO: NonNullable<MountOptions['demo']> = {
  payload: HOST_DEMO_PAYLOAD,
  variables: HOST_DEMO_VARIABLES,
}

const HOST_STATES = { 'sun.sun': { state: 'above_horizon', name: 'Sun' } }

const SEND: HostAction = { id: 'send', label: 'Send to display' }

function actionContextOf(call: unknown): HostActionContext {
  return (call as [string, string, HostActionContext])[2]
}

let container: HTMLElement
const handles: MountHandle[] = []

function mountDesigner(options: MountOptions = {}): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

function shadowButton(label: string): HTMLButtonElement {
  const button = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) {
    throw new Error(`button "${label}" not found in the mounted designer`)
  }
  return button
}

async function clickLoadDemo(): Promise<void> {
  await waitFor(() => shadowButton('Load Demo'))
  await act(async () => {
    fireEvent.click(shadowButton('Load Demo'))
  })
}

function variableInputs(): Record<string, string> {
  const editor = container.shadowRoot!.querySelector('[data-testid="variables-editor"]')
  if (!editor) {
    throw new Error('variables editor not rendered')
  }
  const result: Record<string, string> = {}
  for (const input of editor.querySelectorAll<HTMLInputElement>('input[aria-label^="Value for variable "]')) {
    result[input.getAttribute('aria-label')!.replace('Value for variable ', '')] = input.value
  }
  return result
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
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
    vi.unstubAllGlobals()
  }
})

describe('MountOptions.demo — a host-supplied Load Demo', () => {
  it('Load Demo loads the host demo payload and seeds its variables', async () => {
    // No initial payload, so Load Demo replaces nothing and asks no question.
    const handle = mountDesigner({ states: HOST_STATES, demo: HOST_DEMO })

    await clickLoadDemo()

    await waitFor(() => {
      expect(handle.getPayload()).toBe(serializeYamlPayload(parseYamlPayload(HOST_DEMO_PAYLOAD)))
    })
    expect(handle.getPayload()).not.toContain('ODL/OEPL drawcustom Showcase')

    // The Variables editor lives in the States tab under a host-fed adapter.
    await act(async () => {
      fireEvent.click(shadowButton('States'))
    })
    await waitFor(() => {
      expect(variableInputs()).toEqual(HOST_DEMO_VARIABLES)
    })
  })

  it('a send right after a host Load Demo reports the host demo variables in context.variables', async () => {
    // `context.variables` reads a ref the variable writes keep current (PR
    // #200), so Load Demo's wholesale replace must go through that same
    // write — a plain state set left the next `onAction` reporting the map
    // from before the click. Values arrive typed, as the evaluator registers
    // them: the stored text "false" is the boolean `false`.
    const onAction = vi.fn()
    mountDesigner({
      states: HOST_STATES,
      demo: { payload: HOST_DEMO_PAYLOAD, variables: { ...HOST_DEMO_VARIABLES, alert: 'false' } },
      actions: [SEND],
      onAction,
    })

    await clickLoadDemo()
    await act(async () => {
      fireEvent.click(shadowButton('Send to display'))
    })

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({
      ...HOST_DEMO_VARIABLES,
      alert: false,
    })
  })

  it('without demo, Load Demo still loads the bundled showcase', async () => {
    const handle = mountDesigner({ states: HOST_STATES })

    await clickLoadDemo()

    await waitFor(() => {
      expect(handle.getPayload()).toBe(serializeYamlPayload(SHOWCASE_ELEMENTS))
    })
  })

  it('malformed demo.payload throws out of mount() and leaves the container pristine', () => {
    expect(() => mount(container, { demo: { payload: 'not: a list' } })).toThrow(
      /must be a list of drawing elements/i,
    )

    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('asks before replacing a design, in wording that fits a host demo too', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const handle = mountDesigner({ payload: HOST_DEMO_PAYLOAD.replace('{{ greeting }}', 'mine'), demo: HOST_DEMO })
    const before = handle.getPayload()

    await clickLoadDemo()

    expect(confirmSpy).toHaveBeenCalledWith(
      'Replace the current design with the demo design? Unsaved changes will be lost.',
    )
    expect(LOAD_DEMO_CONFIRM_MESSAGE).not.toMatch(/showcase/i)
    expect(handle.getPayload()).toBe(before)
  })

  it('demo.variables must be a map of strings', () => {
    expect(() =>
      mount(container, {
        demo: { payload: HOST_DEMO_PAYLOAD, variables: { accent: 1 } as unknown as Record<string, string> },
      }),
    ).toThrow(/demo\.variables/)

    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })
})

/**
 * `payload` and `demo.payload` are the same kind of thing and follow one parse
 * rule: an empty string is an empty document, a non-string is a friendly
 * TypeError out of `mount()`, malformed YAML is the parser's error. Before
 * this, `payload: 5` surfaced a raw `source.split is not a function` and
 * `demo.payload: ''` threw where `payload: ''` mounted.
 */
describe('payload and demo.payload share one parse rule', () => {
  it('an empty payload mounts as an empty document', async () => {
    const handle = mountDesigner({ payload: '' })
    expect(handle.getPayload()).toBe(serializeYamlPayload([]))
  })

  it('an empty demo.payload is an empty demo', async () => {
    const handle = mountDesigner({ demo: { payload: '' } })

    await clickLoadDemo()

    await waitFor(() => {
      expect(handle.getPayload()).toBe(serializeYamlPayload([]))
    })
  })

  it('a non-string payload throws a friendly TypeError and leaves the container pristine', () => {
    expect(() => mount(container, { payload: 5 as unknown as string })).toThrow(
      /payload must be a .*YAML string/,
    )
    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('a non-string demo.payload throws a friendly TypeError and leaves the container pristine', () => {
    expect(() => mount(container, { demo: { payload: 5 as unknown as string } })).toThrow(
      /demo\.payload must be a .*YAML string/,
    )
    expect(container.shadowRoot).toBeNull()
    expect(container.childElementCount).toBe(0)
  })
})

/**
 * Hook-level view of the same seam: what the shell does on Load Demo and Clear
 * all when the host supplied a demo, against the real embedded adapter.
 */
describe('useProjectState with a host demo (embedded adapter)', () => {
  function renderEmbedded(options: MountOptions) {
    const host = createEmbeddedHost(options)
    const bootstrap = host.loadBootstrap()
    if (bootstrap instanceof Promise) {
      throw new Error('embedded bootstrap is synchronous by contract')
    }
    return renderHook(() => useProjectState(bootstrap, host))
  }

  it('Load Demo seeds the host demo variables, not the showcase ones; states stay host-fed', () => {
    const { result } = renderEmbedded({ states: HOST_STATES, demo: HOST_DEMO })

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.elements).toEqual(parseYamlPayload(HOST_DEMO_PAYLOAD))
    expect(result.current.mockContext.variables).toEqual(HOST_DEMO_VARIABLES)
    expect(result.current.mockContext.states).toEqual({ 'sun.sun': 'above_horizon' })
    expect(result.current.previewElements[0]).toMatchObject({ value: 'above_horizon / Hello host', color: 'red' })
  })

  it('a host demo without variables seeds none', () => {
    const { result } = renderEmbedded({ states: HOST_STATES, demo: { payload: HOST_DEMO_PAYLOAD } })

    act(() => {
      result.current.setVariable('greeting', 'mine')
      result.current.loadDemo()
    })

    expect(result.current.mockContext.variables).toEqual({})
  })

  it('Load Demo keeps the canvas: a host demo carries no display config', () => {
    const { result } = renderEmbedded({ states: HOST_STATES, demo: HOST_DEMO })
    const before = result.current.canvas

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.canvas).toEqual(before)
  })

  it('Clear all strips the unmodified host demo variables and keeps user edits', () => {
    const { result } = renderEmbedded({ states: HOST_STATES, demo: HOST_DEMO })

    act(() => {
      result.current.loadDemo()
    })
    expect(result.current.mockContext.variables).toEqual(HOST_DEMO_VARIABLES)
    act(() => {
      result.current.setVariable('accent', 'blue')
      result.current.setVariable('mine', 'kept')
    })
    act(() => {
      result.current.clearElements()
    })

    expect(result.current.elements).toEqual([])
    expect(result.current.mockContext.variables).toEqual({ accent: 'blue', mine: 'kept' })
  })

  it('Clear all strips no states under a host demo: it seeds none', () => {
    // No host states, so the Simulator is on and the user can enter states —
    // including one that happens to equal a showcase value. The host demo
    // never seeded it, so Clear all must not treat it as demo data.
    const { result } = renderEmbedded({ demo: HOST_DEMO })
    const [entityId, showcaseValue] = Object.entries(SHOWCASE_MOCK_STATES)[0]
    const [attrEntityId, attrs] = Object.entries(SHOWCASE_MOCK_ATTRIBUTES)[0]
    const [attribute, attrValue] = Object.entries(attrs)[0]

    act(() => {
      result.current.loadDemo()
    })
    act(() => {
      result.current.setMockState(entityId, showcaseValue)
      result.current.setMockAttribute(attrEntityId, attribute, attrValue)
    })
    act(() => {
      result.current.clearElements()
    })

    expect(result.current.elements).toEqual([])
    expect(result.current.mockContext.states).toEqual({ [entityId]: showcaseValue })
    expect(result.current.mockContext.attributes).toEqual({ [attrEntityId]: { [attribute]: attrValue } })
  })

  it('without demo the embedded adapter loads the bundled showcase and its variables', () => {
    const { result } = renderEmbedded({ states: HOST_STATES })

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.elements).toEqual(SHOWCASE_ELEMENTS)
    expect(result.current.mockContext.variables).toEqual(SHOWCASE_VARIABLES)
  })
})

describe('standalone adapter is untouched by the demo seam', () => {
  it('Load Demo loads the bundled showcase', () => {
    const bootstrap = buildAppBootstrap(
      {
        id: 'current',
        name: 'Empty',
        canvas: { width: 400, height: 300, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
        elements: [],
        updatedAt: 1,
      },
      {},
      'session',
    )
    const { result } = renderHook(() => useProjectState(bootstrap, createStandaloneHost()))

    act(() => {
      result.current.loadDemo()
    })

    expect(result.current.elements).toEqual(SHOWCASE_ELEMENTS)
    expect(result.current.mockContext.variables).toEqual(SHOWCASE_VARIABLES)
  })
})
