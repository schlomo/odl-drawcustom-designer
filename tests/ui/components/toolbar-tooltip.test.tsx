/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolbarTooltip } from '../../../src/ui/components/ToolbarTooltip'
import { TOOLBAR_TOOLTIP_SHOW_DELAY_MS } from '../../../src/ui/lib/toolbar-tooltip'

function tooltipFor(buttonName: string): HTMLElement {
  const button = screen.getByRole('button', { name: buttonName })
  const wrapper = button.parentElement
  if (wrapper == null) {
    throw new Error(`missing tooltip wrapper for ${buttonName}`)
  }
  return wrapper.querySelector('[role="tooltip"]') as HTMLElement
}

describe('ToolbarTooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a hover tooltip label for icon-only controls', () => {
    render(
      <ToolbarTooltip label="Copy PNG">
        <button type="button">Copy</button>
      </ToolbarTooltip>,
    )

    expect(tooltipFor('Copy')).toHaveTextContent('Copy PNG')
  })

  it('shows after the delay and hides immediately on mouse leave', () => {
    vi.useFakeTimers()

    render(
      <ToolbarTooltip label="Align top">
        <button type="button">Top</button>
      </ToolbarTooltip>,
    )

    const button = screen.getByRole('button', { name: 'Top' })
    const wrapper = button.parentElement!
    const tooltip = tooltipFor('Top')

    expect(tooltip).toHaveClass('hidden')

    fireEvent.mouseEnter(wrapper)
    act(() => {
      vi.advanceTimersByTime(TOOLBAR_TOOLTIP_SHOW_DELAY_MS)
    })
    expect(tooltip).toHaveClass('visible')
    expect(tooltip).not.toHaveClass('hidden')

    fireEvent.mouseLeave(wrapper)
    expect(tooltip).toHaveClass('hidden')
  })

  it('does not leave the previous tooltip visible when hovering the next control', () => {
    vi.useFakeTimers()

    render(
      <div>
        <ToolbarTooltip label="Align top">
          <button type="button">Top</button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Align bottom">
          <button type="button">Bottom</button>
        </ToolbarTooltip>
      </div>,
    )

    const topWrapper = screen.getByRole('button', { name: 'Top' }).parentElement!
    const bottomWrapper = screen.getByRole('button', { name: 'Bottom' }).parentElement!
    const topTooltip = tooltipFor('Top')
    const bottomTooltip = tooltipFor('Bottom')

    fireEvent.mouseEnter(topWrapper)
    act(() => {
      vi.advanceTimersByTime(TOOLBAR_TOOLTIP_SHOW_DELAY_MS)
    })
    expect(topTooltip).toHaveClass('visible')

    screen.getByRole('button', { name: 'Top' }).focus()
    fireEvent.mouseLeave(topWrapper)
    fireEvent.mouseEnter(bottomWrapper)
    act(() => {
      vi.advanceTimersByTime(TOOLBAR_TOOLTIP_SHOW_DELAY_MS)
    })

    expect(topTooltip).toHaveClass('hidden')
    expect(bottomTooltip).toHaveClass('visible')
  })
})
