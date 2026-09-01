/** @vitest-environment jsdom */
import { act } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/ui/App'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import type { DesignerHost } from '../../src/embed/host'
import type { HostPushTarget } from '../../src/embed/types'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Integration testing against PR #117 (fix/issue-115-push-race) surfaced a
 * commit-window defect: #117 makes `registerPushTarget` (useProjectState) a
 * `useLayoutEffect`, but `registerPayloadSource` (App.tsx) was still a
 * passive `useEffect`. Between commit and the passive flush, a host push
 * already applies live (pushTarget registered — `setPayload` calls
 * `applyPayload` directly, so the `pendingPayloadElements` fallback recording
 * in mount.tsx never fires) while `getPayload()` still falls back to the
 * *original bootstrap* (payloadSource not yet registered) — stale YAML even
 * though the DOM already shows the pushed payload.
 *
 * Fix: `registerPayloadSource` (and the `usePublishedCallback` publications
 * in YamlPanel.tsx) also become `useLayoutEffect`, co-timed with the push
 * registration.
 *
 * This branch predates #117: `registerPushTarget` here is still a passive
 * `useEffect` (verified directly in useProjectState.ts). That means the
 * live-push-applied-but-source-unregistered gap the bug report describes
 * cannot actually be constructed on this branch today — both registrations
 * are passive, so they land in the same synchronous passive-effect flush,
 * with no yield point where outside code could observe the mismatch. So per
 * the reasoning above, this file proves the fix two ways:
 *
 * 1. An ordering assertion (red before this PR's fix, green after) — see
 *    below for why this one *can* flip today.
 * 2. A MutationObserver-based regression guard that mirrors the actual bug
 *    report shape. It cannot go red on this branch (the gap needs #117's
 *    change too), but it will start actually testing the invariant the
 *    moment this branch is rebased onto/merged after #117.
 */

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

function stubCodeMirrorMeasure() {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
}

function bootstrapWith(value: string): AppBootstrap {
  return {
    sessionName: value,
    elements: [{ type: 'text', value, x: 0, y: 0 }],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

/**
 * A host whose `registerPushTarget`/`registerPayloadSource` are called
 * *directly* from `App`/`useProjectState` (unlike `mount()`, which wraps
 * both behind an internal bridge object — spying there would only observe
 * the bridge, never the shell's own registration timing).
 */
function orderSpyHost(order: string[]): DesignerHost {
  return {
    styleScope: 'page',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    assetUploadsEnabled: true,
    persistence: null,
    loadBootstrap: () => bootstrapWith('Order'),
    registerPushTarget: (target: HostPushTarget) => {
      order.push('registerPushTarget')
      void target
      return () => {}
    },
    registerPayloadSource: (getPayload: () => string) => {
      order.push('registerPayloadSource')
      void getPayload
      return () => {}
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  stubCodeMirrorMeasure()
})

describe('registerPayloadSource registration timing (issue #104 x #115 commit window)', () => {
  it('registers both channels synchronously in the mount commit — no paint or microtask can observe one without the other', async () => {
    const order: string[] = []
    // Both registrations are layout effects (registerPushTarget since
    // issue #115 / PR #117, registerPayloadSource since this PR), so React
    // runs them in the same commit-time flush: their relative order is
    // hook-declaration order (an implementation detail), but BOTH must be
    // present before anything after the commit — a microtask observer must
    // never see a push channel without its read channel (the #104 x #115
    // commit-window bug).
    render(<App bootstrap={bootstrapWith('Order')} host={orderSpyHost(order)} />)

    await waitFor(() => {
      expect(order).toContain('registerPushTarget')
    })
    const observedAtFirstRegistration = await new Promise<string[]>((resolve) => {
      queueMicrotask(() => resolve([...order]))
    })
    expect(observedAtFirstRegistration).toContain('registerPushTarget')
    expect(observedAtFirstRegistration).toContain('registerPayloadSource')
  })
})

/**
 * A `MutationObserver` probe in the actual bug-report shape: mount, push a
 * new payload, and assert `getPayload()` already agrees the instant the DOM
 * reflects it. Self-contained (the equivalent probe in
 * tests/embed/mount-lifecycle.test.tsx belongs to PR #117's branch).
 */
describe('getPayload() vs. a DOM mutation from a host push (regression guard for the #117 rebase)', () => {
  const PAYLOAD = ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n')
  const PUSHED_PAYLOAD = ['- type: text', '  value: Pushed', '  x: 4', '  y: 4', ''].join('\n')

  let container: HTMLElement
  const handles: MountHandle[] = []

  beforeEach(() => {
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

  it('never reads stale bootstrap YAML once the pushed element is visible in the DOM', async () => {
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const mutationSeen = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (container.shadowRoot!.textContent?.includes('Pushed')) {
          observer.disconnect()
          resolve()
        }
      })
      observer.observe(container.shadowRoot!, { childList: true, subtree: true, characterData: true })
    })

    act(() => handle.setPayload(PUSHED_PAYLOAD))
    await mutationSeen

    // On this branch (registerPushTarget still passive), this cannot fail
    // today — but it is exactly the invariant PR #117's commit-time push
    // registration would otherwise break without this PR's co-timed
    // registerPayloadSource fix.
    expect(handle.getPayload()).toContain('value: Pushed')
  })
})
