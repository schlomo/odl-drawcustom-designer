/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { PropertyPanel } from '../../../src/ui/components/PropertyPanel'

// jsdom has no ResizeObserver (used by the overflow-indicator hook, issue #84).
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

const element: DrawElement = { type: 'text', value: 'A', x: 0, y: 0 }

function renderPanel(props: Partial<React.ComponentProps<typeof PropertyPanel>> = {}) {
  return render(
    <PropertyPanel
      elements={[element]}
      indices={[0]}
      elementCount={1}
      fontKeys={[]}
      onPropertyChange={() => {}}
      onUploadFont={() => Promise.reject(new Error('unused'))}
      onUploadImageForUrl={() => Promise.reject(new Error('unused'))}
      onDelete={() => {}}
      onBringToFront={() => {}}
      onSendToBack={() => {}}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      {...props}
    />,
  )
}

describe('PropertyPanel blocked state (issue #35)', () => {
  it('shows the blocked message with a selection', () => {
    renderPanel({ blocked: true, blockedVisible: true })
    expect(screen.getByTestId('property-panel-blocked-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('property-panel-blocked-overlay')).toHaveTextContent(
      'YAML has errors',
    )
  })

  it('shows the blocked message in the empty state too (nothing selected)', () => {
    renderPanel({ elements: [], indices: [], blocked: true, blockedVisible: true })
    expect(screen.getByTestId('property-panel-blocked-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('property-panel-blocked-overlay')).toHaveTextContent(
      'YAML has errors',
    )
  })

  it('shows no blocked message while the doc is valid', () => {
    renderPanel({ elements: [], indices: [] })
    expect(screen.queryByTestId('property-panel-blocked-overlay')).not.toBeInTheDocument()
  })
})
