/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { Sidebar } from '../../../src/ui/components/Sidebar'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const defaultCanvas = {
  width: 384,
  height: 184,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

function renderSidebar() {
  render(
    <Sidebar
      elements={[]}
      previewElements={[]}
      selectedIndices={[]}
      canvas={defaultCanvas}
      mockContext={{ states: {} }}
      assetRevision={0}
      onSelectElement={() => {}}
      onApplyResolution={() => {}}
      onCanvasSizeChange={() => {}}
      onColorModeChange={() => {}}
      onRotationChange={() => {}}
      onSetMockState={() => {}}
      onAddMockEntity={() => {}}
      onRemoveMockEntity={() => {}}
      onUploadAsset={async () => ({ ok: true, mime: 'image/png' })}
      onClearAsset={() => {}}
      onReorderElement={() => {}}
    />,
  )
}

function bootstrapForApp() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Custom',
      canvas: {
        width: 400,
        height: 300,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Custom only', x: 5, y: 5 }],
      updatedAt: 1,
    },
    {},
    'session',
  )
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

async function renderApp() {
  render(<App bootstrap={bootstrapForApp()} />)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Load Demo' })).toBeInTheDocument()
  })
}

async function clickLoadDemo() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo' }))
  })
}

describe('Load Demo UX', () => {
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

  it('does not render the sidebar example dropdown', () => {
    renderSidebar()

    expect(screen.queryByRole('heading', { name: 'Load example' })).toBeNull()
    expect(screen.queryByText('Choose a design…')).toBeNull()
  })

  it('loads the showcase demo from the header button', async () => {
    render(<App bootstrap={buildAppBootstrap(
      {
        id: 'current',
        name: 'Empty',
        canvas: {
          width: 400,
          height: 300,
          rotation: 0,
          colorMode: 'bwr',
          previewDitherMode: 0,
        },
        elements: [],
        updatedAt: 1,
      },
      {},
      'session',
    )} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load Demo' })).toBeInTheDocument()
    })
    await clickLoadDemo()

    await waitFor(() => {
      expect(screen.getAllByText('ODL/OEPL drawcustom Showcase').length).toBeGreaterThan(0)
    })
  })

  it('asks for confirmation before replacing an existing design', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderApp()
    await clickLoadDemo()

    expect(confirmSpy).toHaveBeenCalledWith(
      'Replace the current design with the showcase demo? Unsaved changes will be lost.',
    )
    await waitFor(() => {
      expect(screen.getAllByText('Custom only').length).toBeGreaterThan(0)
    })
  })

  it('loads the showcase demo after the user confirms replace', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderApp()
    await clickLoadDemo()

    await waitFor(() => {
      expect(screen.getAllByText('ODL/OEPL drawcustom Showcase').length).toBeGreaterThan(0)
    })
  })
})
