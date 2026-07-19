/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElementList } from '../../../src/ui/components/ElementList'
import type { DrawElement } from '../../../src/core'

function makeElements(count: number): DrawElement[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'text',
    value: `Row ${index}`,
    x: 0,
    y: 0,
  }))
}

describe('ElementList selection scroll', () => {
  afterEach(() => {
    delete (HTMLElement.prototype as HTMLElement & { scrollIntoView?: () => void }).scrollIntoView
  })

  it('scrolls the newly selected row into view with block: nearest', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const elements = makeElements(5)
    const { rerender } = render(
      <ElementList
        previewElements={elements}
        selectedIndices={[]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(
      <ElementList
        previewElements={elements}
        selectedIndices={[3]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(
      screen.getByRole('button', { name: /Row 3/i }),
    )
  })

  it('scrolls to the last (primary) index when several rows are selected at once', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const elements = makeElements(6)
    render(
      <ElementList
        previewElements={elements}
        selectedIndices={[1, 4]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(scrollIntoView.mock.instances[0]).toBe(
      screen.getByRole('button', { name: /Row 4/i }),
    )
  })

  it('scrolls to the newly shift-selected row, not the highest index', () => {
    // useProjectState numerically sorts additive selections, so [5] plus a
    // shift-click on 2 arrives as [2, 5] — the row the user just clicked
    // (2) must be the scroll target, not the highest index (5).
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const elements = makeElements(6)
    const { rerender } = render(
      <ElementList
        previewElements={elements}
        selectedIndices={[5]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )
    scrollIntoView.mockClear()

    rerender(
      <ElementList
        previewElements={elements}
        selectedIndices={[2, 5]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(
      screen.getByRole('button', { name: /Row 2/i }),
    )
  })

  it('does not scroll while the user is dragging a row in the list', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const elements = makeElements(5)
    const { rerender } = render(
      <ElementList
        previewElements={elements}
        selectedIndices={[0]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )
    scrollIntoView.mockClear()

    const rows = screen.getAllByTestId('element-list-row')
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => {},
      getData: () => '0',
    }
    fireEvent.dragStart(rows[0]!, { dataTransfer })

    // A selection change arrives mid-drag (e.g. a keyboard nav elsewhere) —
    // the list must not yank itself out from under the user's drag.
    rerender(
      <ElementList
        previewElements={elements}
        selectedIndices={[3]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not move an already-visible row (native scrollIntoView is a no-op with block: nearest)', () => {
    // This is a behavior contract on the call, verified end-to-end in
    // Playwright (tests/e2e/element-list-scroll.spec.ts) where jsdom cannot
    // observe real scroll geometry: `block: 'nearest'` is what makes an
    // already-visible row a zero-movement no-op in a real browser.
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const elements = makeElements(3)
    render(
      <ElementList
        previewElements={elements}
        selectedIndices={[1]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
