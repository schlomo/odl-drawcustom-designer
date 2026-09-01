/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../src/ui/App'
import type { AppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import type { DrawElement } from '../../../src/core'

/**
 * The import notice (maintainer ruling: "we normalize y to 0 with an info").
 * A user whose imported design was silently relocated must be told — the whole
 * point of materializing the coordinate rather than guessing a flow cursor.
 */
const STANDALONE_HOST = createStandaloneHost()

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

function bootstrap(overrides: Partial<AppBootstrap>): AppBootstrap {
  return {
    sessionName: 'Shared',
    elements: [{ type: 'text', value: 'Hi', x: 4, y: 0 }] as unknown as DrawElement[],
    canvas: { width: 296, height: 128, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'hash',
    ...overrides,
  }
}

describe('import normalization notice', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('names the count and the affected types after an import that needed it', async () => {
    render(
      <App
        bootstrap={bootstrap({ normalization: { verticalCount: 2, verticalTypes: ['line', 'text'], spacingCount: 0 } })}
        host={STANDALONE_HOST}
      />,
    )

    const notice = await screen.findByText(/no vertical coordinate/i)
    expect(notice.textContent).toContain('2')
    expect(notice.textContent).toContain('line')
    expect(notice.textContent).toContain('text')
  })

  it('can be dismissed and stays gone', async () => {
    render(
      <App
        bootstrap={bootstrap({ normalization: { verticalCount: 1, verticalTypes: ['text'], spacingCount: 0 } })}
        host={STANDALONE_HOST}
      />,
    )

    await screen.findByText(/no vertical coordinate/i)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    await waitFor(() => {
      expect(screen.queryByText(/no vertical coordinate/i)).toBeNull()
    })
  })

  it('names the dropped multiline spacing keys and says they changed nothing visible', async () => {
    render(
      <App
        bootstrap={bootstrap({
          normalization: { verticalCount: 0, verticalTypes: [], spacingCount: 2 },
        })}
        host={STANDALONE_HOST}
      />,
    )

    const notice = await screen.findByText(/removed spacing from 2 multiline elements/i)
    expect(notice).toBeInTheDocument()
    const banner = notice.closest('[role="status"]')
    expect(banner?.textContent).toMatch(/changes nothing you can see/i)
    expect(banner?.textContent).not.toMatch(/no vertical coordinate/i)
  })

  it('says nothing when the imported payload was already explicit', async () => {
    render(<App bootstrap={bootstrap({})} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Demo' })).toBeInTheDocument()
    })
    expect(screen.queryByText(/no vertical coordinate/i)).toBeNull()
  })
})
