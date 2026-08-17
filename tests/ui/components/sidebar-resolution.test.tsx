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
    canvas: Omit<typeof defaultCanvas, 'rotation'> & { rotation: 0 | 90 | 180 | 270 }
    onCanvasSizeChange: (width: number, height: number) => void
  }> = {},
) {
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
      onCanvasSizeChange={onCanvasSizeChange}
      onColorModeChange={() => {}}
      onRotationChange={() => {}}
      onSetMockState={() => {}}
      onAddMockEntity={() => {}}
      onRemoveMockEntity={() => {}}
      variables={{}}
      onSetVariable={() => {}}
      onAddVariable={() => {}}
      onRemoveVariable={() => {}}
      onUploadAsset={async () => ({ ok: true, mime: 'image/png' })}
      onClearAsset={() => {}}
      onReorderElement={() => {}}
    />,
  )

  return { onCanvasSizeChange }
}

function openResolutionMenu() {
  fireEvent.click(screen.getByLabelText('Resolution'))
  return screen.getByRole('listbox', { name: 'Resolution options' })
}

describe('Sidebar resolution control', () => {
  afterEach(() => {
    delete (HTMLElement.prototype as HTMLElement & { scrollIntoView?: () => void }).scrollIntoView
  })

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
    const onCanvasSizeChange = vi.fn()
    renderSidebar({ onCanvasSizeChange })

    const listbox = openResolutionMenu()
    fireEvent.mouseDown(within(listbox).getByRole('option', { name: /800×480/i }))

    expect(onCanvasSizeChange).toHaveBeenCalledWith(800, 480)
    expect(screen.queryByRole('listbox', { name: 'Resolution options' })).toBeNull()
  })

  /**
   * Issue #139 F3: the orientation control is the sole owner of orientation.
   * The resolution control names a display's two dimensions; it neither reports
   * nor changes which way round they are held.
   */
  describe('while the canvas is turned', () => {
    const turned = { ...defaultCanvas, width: 128, height: 296, rotation: 90 as const }

    it('still reads as the quick-pick that display is, not Custom', () => {
      renderSidebar({ canvas: turned })

      expect(screen.getByLabelText('Resolution')).toHaveTextContent('296×128')
      expect(screen.getByLabelText('Resolution')).not.toHaveTextContent(/Custom/i)
      // …so the manual W/H inputs stay away: nothing custom happened.
      expect(screen.queryByRole('spinbutton', { name: 'W' })).toBeNull()

      const listbox = openResolutionMenu()
      expect(within(listbox).getByRole('option', { name: /296×128/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    it('applies a quick-pick in the orientation being held', () => {
      const onCanvasSizeChange = vi.fn()
      renderSidebar({ canvas: turned, onCanvasSizeChange })

      const listbox = openResolutionMenu()
      fireEvent.mouseDown(within(listbox).getByRole('option', { name: /800×480/i }))

      expect(onCanvasSizeChange).toHaveBeenCalledWith(480, 800)
    })
  })

  it('names each quick-pick by its dimensions alone', () => {
    // No Portrait/Landscape tag: it would claim the resolution control decides
    // orientation, which is the orientation control's job (issue #139 F3).
    renderSidebar()

    const listbox = openResolutionMenu()
    expect(within(listbox).getByRole('option', { name: /800×480/i })).toHaveTextContent(
      /^800×480$/,
    )
    expect(within(listbox).queryByText(/Portrait|Landscape|Square/)).toBeNull()
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
