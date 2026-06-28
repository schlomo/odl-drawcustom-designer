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

describe('StateSimulator variables — Current/All scope (mirrors entities)', () => {
  it('Current scope shows only payload-referenced variables, hiding stale stored ones', () => {
    // The payload references `something2`; a stale stored `something` (left over
    // from a YAML rename) is NOT referenced. Current scope must mirror entity
    // behavior: surface only what the payload uses.
    const elements: DrawElement[] = [
      { type: 'text', value: '{{ something2 }}', x: 0, y: 0 } as unknown as DrawElement,
    ]
    renderSimulator({ elements, variables: { something: 'val' }, scope: 'current' })

    expect(screen.getByLabelText('Value for variable something2')).toBeInTheDocument()
    expect(screen.queryByLabelText('Value for variable something')).toBeNull()
  })

  it('All scope shows stored variables even when not referenced in the payload', () => {
    const elements: DrawElement[] = [
      { type: 'text', value: '{{ something2 }}', x: 0, y: 0 } as unknown as DrawElement,
    ]
    renderSimulator({ elements, variables: { something: 'val' }, scope: 'all' })

    expect(screen.getByLabelText('Value for variable something2')).toBeInTheDocument()
    expect(screen.getByLabelText('Value for variable something')).toBeInTheDocument()
  })

  it('Current scope hides a stored variable that the payload never references', () => {
    renderSimulator({ elements: [], variables: { leftover: 'x' }, scope: 'current' })
    expect(screen.queryByLabelText('Value for variable leftover')).toBeNull()
  })
})

describe('StateSimulator variables — renamed variable in YAML (regression #8)', () => {
  it('surfaces the renamed reference and applies its value immediately', () => {
    // Repro: user had `something`, renamed it to `something2` in the YAML. The
    // pre-filled row must show `something2` (the live reference) and editing its
    // value must write through immediately — not get shadowed by stale storage.
    const elements: DrawElement[] = [
      { type: 'text', value: '{{ something2 }}', x: 0, y: 0 } as unknown as DrawElement,
    ]
    const { props } = renderSimulator({
      elements,
      variables: { something: 'val' },
      scope: 'current',
    })

    const valueInput = screen.getByLabelText('Value for variable something2')
    expect(valueInput).toHaveValue('')

    fireEvent.change(valueInput, { target: { value: 'green' } })
    expect(props.onSetVariable).toHaveBeenCalledWith('something2', 'green')
  })
})
