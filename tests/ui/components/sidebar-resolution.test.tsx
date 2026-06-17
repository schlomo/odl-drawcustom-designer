/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../../src/ui/components/Sidebar'

const defaultCanvas = {
  width: 384,
  height: 184,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

function renderSidebar(
  overrides: Partial<{
    canvas: typeof defaultCanvas
    onApplyResolution: (width: number, height: number) => void
    onCanvasSizeChange: (width: number, height: number) => void
  }> = {},
) {
  const onApplyResolution = overrides.onApplyResolution ?? vi.fn()
  const onCanvasSizeChange = overrides.onCanvasSizeChange ?? vi.fn()

  render(
    <Sidebar
      elements={[]}
      previewElements={[]}
      selectedIndices={[]}
      canvas={overrides.canvas ?? defaultCanvas}
      mockContext={{ states: {} }}
      assetRevision={0}
      onSelectElement={() => {}}
      onApplyResolution={onApplyResolution}
      onCanvasSizeChange={onCanvasSizeChange}
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

  return { onApplyResolution, onCanvasSizeChange }
}

function openResolutionMenu() {
  fireEvent.click(screen.getByLabelText('Resolution'))
  return screen.getByRole('listbox', { name: 'Resolution options' })
}

afterEach(() => {
  delete (HTMLElement.prototype as HTMLElement & { scrollIntoView?: () => void }).scrollIntoView
})

describe('Sidebar resolution control', () => {
  it('hides W/H inputs on a quick-pick until Custom is selected', () => {
    renderSidebar()

    expect(screen.queryByRole('spinbutton', { name: 'W' })).toBeNull()

    const listbox = openResolutionMenu()
    fireEvent.mouseDown(within(listbox).getByRole('option', { name: /Custom/i }))

    expect(screen.getByRole('spinbutton', { name: 'W' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'H' })).toBeInTheDocument()
  })

  it('shows W/H inputs immediately for non-list dimensions', () => {
    renderSidebar({
      canvas: { ...defaultCanvas, width: 565, height: 480 },
    })

    expect(screen.getByRole('spinbutton', { name: 'W' })).toHaveValue(565)
    expect(screen.getByRole('spinbutton', { name: 'H' })).toHaveValue(480)
  })

  it('applies a quick-pick from the dropdown', () => {
    const onApplyResolution = vi.fn()
    renderSidebar({ onApplyResolution })

    const listbox = openResolutionMenu()
    fireEvent.mouseDown(within(listbox).getByRole('option', { name: /800×480/i }))

    expect(onApplyResolution).toHaveBeenCalledWith(800, 480)
    expect(screen.queryByRole('listbox', { name: 'Resolution options' })).toBeNull()
  })

  it('shows landscape and portrait hints in the resolution menu', () => {
    renderSidebar()

    const listbox = openResolutionMenu()
    expect(within(listbox).getByRole('option', { name: /800×480/i })).toHaveTextContent('Landscape')
    expect(within(listbox).getByRole('option', { name: /168×384/i })).toHaveTextContent('Portrait')
    expect(within(listbox).getByRole('option', { name: /152×152/i })).toHaveTextContent('Square')
  })

  it('scrolls the current resolution into the middle when opening the menu', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    renderSidebar()

    const listbox = openResolutionMenu()
    expect(within(listbox).getByRole('option', { name: /384×184/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })
})
