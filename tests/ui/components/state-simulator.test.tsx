/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement, HaMockContext } from '../../../src/core'
import { StateSimulator } from '../../../src/ui/components/StateSimulator'

const noop = () => {}

function renderSimulator(
  overrides: Partial<Parameters<typeof StateSimulator>[0]> = {},
) {
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
    ...overrides,
  }
  return { props, ...render(<StateSimulator {...props} />) }
}

describe('StateSimulator attributes', () => {
  it('pre-fills attribute rows referenced in the payload and applies value edits immediately', () => {
    const elements: DrawElement[] = [
      {
        type: 'text',
        value: "{{ state_attr('sensor.x', 'foo') }}",
        x: 0,
        y: 0,
      },
    ]
    const { props } = renderSimulator({
      elements,
      mockContext: { states: { 'sensor.x': 'unknown' }, attributes: {} },
    })

    // The referenced attribute is surfaced as an empty pre-filled row even though
    // it is not yet present in the mock context.
    const valueInput = screen.getByLabelText('Attribute foo of sensor.x')
    expect(valueInput).toHaveValue('')

    // Editing the value applies immediately (no extra "add attribute" step).
    fireEvent.change(valueInput, { target: { value: '42' } })
    expect(props.onSetMockAttribute).toHaveBeenCalledWith('sensor.x', 'foo', 42)
  })

  it('stores a typed boolean (not the string "false") when editing an attribute value', () => {
    const elements: DrawElement[] = [
      {
        type: 'text',
        value: "{{ is_state_attr('calendar.home', 'all_day', false) }}",
        x: 0,
        y: 0,
      },
    ]
    const { props } = renderSimulator({
      elements,
      mockContext: { states: { 'calendar.home': 'on' }, attributes: {} },
    })

    fireEvent.change(screen.getByLabelText('Attribute all_day of calendar.home'), {
      target: { value: 'false' },
    })

    expect(props.onSetMockAttribute).toHaveBeenCalledWith('calendar.home', 'all_day', false)
  })

  it('renders a stored boolean attribute back as an editable "false" string', () => {
    renderSimulator({
      mockContext: {
        states: { 'calendar.home': 'on' },
        attributes: { 'calendar.home': { all_day: false } },
      },
    })

    expect(screen.getByLabelText('Attribute all_day of calendar.home')).toHaveValue('false')
  })

  it('folds the add-attribute editor behind a compact affordance for empty entities', () => {
    renderSimulator({
      mockContext: { states: { 'sensor.y': 'on' }, attributes: {} },
    })

    // No always-on empty draft row wasting vertical space.
    expect(screen.queryByLabelText('New attribute name for sensor.y')).toBeNull()

    // A compact affordance reveals the draft inputs on demand.
    fireEvent.click(screen.getByRole('button', { name: 'Add attribute to sensor.y' }))
    expect(screen.getByLabelText('New attribute name for sensor.y')).toBeInTheDocument()
  })

  it('renders non-string attribute values as safe input strings without crashing', () => {
    expect(() =>
      renderSimulator({
        mockContext: {
          states: { 'sensor.z': 'x' },
          attributes: {
            'sensor.z': { big: BigInt(10), undef: undefined, nested: { a: 1 } },
          },
        },
      }),
    ).not.toThrow()

    expect(screen.getByLabelText('Attribute big of sensor.z')).toHaveValue('10')
    expect(screen.getByLabelText('Attribute undef of sensor.z')).toHaveValue('')
    expect(screen.getByLabelText('Attribute nested of sensor.z')).toHaveValue('{"a":1}')
  })
})
