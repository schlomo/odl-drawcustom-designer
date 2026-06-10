/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('Load Demo UX', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
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

  it('loads the showcase demo from the header button', () => {
    render(<App bootstrap={bootstrapForApp()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load Demo' }))

    expect(screen.getAllByText('ODL drawcustom Showcase').length).toBeGreaterThan(0)
  })

  it('asks for confirmation before replacing a dirty session', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App bootstrap={bootstrapForApp()} />)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load Demo' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('Custom only').length).toBeGreaterThan(0)
  })
})
