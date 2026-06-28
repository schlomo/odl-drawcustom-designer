/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement, HaMockContext } from '../../../src/core'
import { StateSimulator } from '../../../src/ui/components/StateSimulator'

const noop = () => {}

function renderSimulator(overrides: Partial<Parameters<typeof StateSimulator>[0]> = {}) {
  const props = {
    elements: [] as DrawElement[],
    mockContext: { states: {}, attributes: {} } as HaMockContext,
    scope: 'all' as const,
    onScopeChange: noop,
    onSetMockState: noop,
    onAddEntity: noop,
    onRemoveEntity: noop,
    onSetMockAttribute: vi.fn(),
    onRenameMockAttribute: vi.fn(),
    onRemoveMockAttribute: vi.fn(),
    variables: {} as Record<string, string>,
    onSetVariable: vi.fn(),
    onAddVariable: vi.fn(),
    onRenameVariable: vi.fn(),
    onRemoveVariable: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<StateSimulator {...props} />) }
}

describe('StateSimulator variables', () => {
  it('pre-fills a variable row referenced in the payload and applies edits immediately', () => {
    const elements: DrawElement[] = [
      { type: 'text', value: '{{ uv_fill }}', x: 0, y: 0 } as unknown as DrawElement,
    ]
    const { props } = renderSimulator({ elements })

    // The referenced variable is surfaced as an empty pre-filled row even though
    // it is not yet stored (mirrors attribute pre-fill).
    const valueInput = screen.getByLabelText('Value for variable uv_fill')
    expect(valueInput).toHaveValue('')

    // Editing the value applies immediately (no extra "add variable" step).
    fireEvent.change(valueInput, { target: { value: 'green' } })
    expect(props.onSetVariable).toHaveBeenCalledWith('uv_fill', 'green')
  })

  it('renders a stored variable value back as an editable string', () => {
    renderSimulator({ variables: { accent: 'red' } })
    expect(screen.getByLabelText('Value for variable accent')).toHaveValue('red')
  })

  it('folds the add-variable editor behind a compact affordance', () => {
    renderSimulator()

    // No always-on empty draft row wasting vertical space.
    expect(screen.queryByLabelText('New variable name')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    expect(screen.getByLabelText('New variable name')).toBeInTheDocument()
  })

  it('adds a manually defined variable through the draft inputs', () => {
    const { props } = renderSimulator()

    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.change(screen.getByLabelText('New variable name'), { target: { value: 'label' } })
    fireEvent.change(screen.getByLabelText('New variable value'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))

    expect(props.onAddVariable).toHaveBeenCalledWith('label', 'hi')
  })
})
