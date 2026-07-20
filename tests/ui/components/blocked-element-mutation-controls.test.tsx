/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { CanvasHeaderToolbar } from '../../../src/ui/components/CanvasHeaderToolbar'
import { CanvasSelectionToolbar } from '../../../src/ui/components/CanvasSelectionToolbar'
import { ElementList } from '../../../src/ui/components/ElementList'
import { ElementToolbar } from '../../../src/ui/components/ElementToolbar'

/**
 * Issue #35 contract: NO element mutation while the YAML doc is blocked.
 * The canvas pointer/keyboard guards and the property panel fieldset cover
 * their surfaces; these tests pin every remaining element-mutating control
 * group (found in the PR #42 review sweep): canvas header undo/redo, the
 * multi-selection align/layer toolbar, the add-element toolbar, and the
 * element list's drag-reorder.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const elements: DrawElement[] = [
  { type: 'text', value: 'A', x: 0, y: 0 },
  { type: 'text', value: 'B', x: 1, y: 1 },
]

describe('canvas header toolbar while YAML is blocked', () => {
  it('disables undo/redo even when history is available', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(
      <CanvasHeaderToolbar
        showLabels
        zoomMode="fit"
        onZoomModeChange={() => {}}
        getFeedback={() => null}
        getFeedbackMessage={() => null}
        onCopyPng={() => {}}
        onDownloadPng={() => {}}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
        showHiddenHints={false}
        onToggleShowHiddenHints={() => {}}
        snapGrid={{ enabled: false, size: 10 }}
        onToggleSnap={() => {}}
        previewDitherMode={0}
        onTogglePreviewDither={() => {}}
        blocked
      />,
    )

    const undo = screen.getByRole('button', { name: /undo/i })
    const redo = screen.getByRole('button', { name: /redo/i })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()
    fireEvent.click(undo)
    fireEvent.click(redo)
    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })
})

describe('canvas multi-selection toolbar while YAML is blocked', () => {
  it('disables align and layer buttons and ignores clicks', () => {
    const onAlign = vi.fn()
    const onBringToFront = vi.fn()
    render(
      <CanvasSelectionToolbar
        selectionCount={2}
        canAlign
        canMoveUp
        canMoveDown
        boundsByIndex={new Map()}
        onAlign={onAlign}
        onBringToFront={onBringToFront}
        onSendToBack={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        blocked
      />,
    )

    const alignLeft = screen.getByRole('button', { name: /align left/i })
    const bringToFront = screen.getByRole('button', { name: /bring to front/i })
    expect(alignLeft).toBeDisabled()
    expect(bringToFront).toBeDisabled()
    expect(screen.getByRole('button', { name: /move layer down/i })).toBeDisabled()
    fireEvent.click(alignLeft)
    fireEvent.click(bringToFront)
    expect(onAlign).not.toHaveBeenCalled()
    expect(onBringToFront).not.toHaveBeenCalled()
  })
})

describe('add-element toolbar while YAML is blocked', () => {
  it('disables all add buttons and ignores clicks', () => {
    const onAddElement = vi.fn()
    render(<ElementToolbar elements={elements} onAddElement={onAddElement} blocked />)

    const addText = screen.getByRole('button', { name: /add text/i })
    expect(addText).toBeDisabled()
    fireEvent.click(addText)
    expect(onAddElement).not.toHaveBeenCalled()

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })
})

describe('element list while YAML is blocked', () => {
  it('turns off drag-reorder and ignores drops', () => {
    const onReorderElement = vi.fn()
    render(
      <ElementList
        previewElements={elements}
        selectedIndices={[]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={onReorderElement}
        blocked
      />,
    )

    const rows = screen.getAllByTestId('element-list-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).toHaveAttribute('draggable', 'false')
    }

    // Even a synthetic drop (bypassing the draggable attribute) must not
    // reorder while blocked.
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => {},
      getData: () => '0',
    }
    fireEvent.dragStart(rows[0]!, { dataTransfer })
    fireEvent.dragOver(rows[1]!.closest('li')!, { dataTransfer })
    fireEvent.drop(rows[1]!.closest('li')!, { dataTransfer })
    expect(onReorderElement).not.toHaveBeenCalled()
  })
})
