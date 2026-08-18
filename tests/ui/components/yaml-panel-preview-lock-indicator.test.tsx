/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { YamlPanel } from '../../../src/ui/components/YamlPanel'

/**
 * Maintainer manual-validation finding on PR #143: while Display preview is
 * active the YAML panel goes read-only (issue #109), but nothing in the
 * header said so — a host render sits over a frozen document with no visible
 * explanation. The heading now grows a short, muted suffix exactly while
 * `readOnly` is true, mirroring the existing disabled-with-a-stated-reason
 * pattern the rest of the preview seam uses.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const elements: DrawElement[] = [{ type: 'text', value: 'A', x: 0, y: 0 }]

function panelProps(overrides: Partial<React.ComponentProps<typeof YamlPanel>> = {}) {
  return {
    elements,
    sessionName: 'test-session',
    selectedIndex: null,
    selectionSource: 'canvas' as const,
    onSelectElement: () => {},
    onElementsChange: () => {},
    colorScheme: 'dark' as const,
    containerRef: { current: null },
    canvasDragging: false,
    propertyEditing: false,
    ...overrides,
  }
}

describe('YamlPanel heading — Display preview lock indicator', () => {
  it('shows no lock suffix outside preview mode', () => {
    render(<YamlPanel {...panelProps({ readOnly: false })} />)

    expect(screen.getByRole('heading', { name: 'YAML' })).toBeInTheDocument()
    expect(screen.queryByTestId('yaml-lock-indicator')).not.toBeInTheDocument()
  })

  it('shows a muted "locked by Display preview" suffix while readOnly', () => {
    render(<YamlPanel {...panelProps({ readOnly: true })} />)

    const indicator = screen.getByTestId('yaml-lock-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveTextContent('locked by Display preview')
    // Still inside the same heading, not a second, disconnected label.
    expect(screen.getByRole('heading').textContent).toContain('YAML')
    expect(screen.getByRole('heading').textContent).toContain('locked by Display preview')
  })

  it('the suffix disappears again once preview mode exits', () => {
    const { rerender } = render(<YamlPanel {...panelProps({ readOnly: true })} />)
    expect(screen.getByTestId('yaml-lock-indicator')).toBeInTheDocument()

    rerender(<YamlPanel {...panelProps({ readOnly: false })} />)
    expect(screen.queryByTestId('yaml-lock-indicator')).not.toBeInTheDocument()
  })
})
