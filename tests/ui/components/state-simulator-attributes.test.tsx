/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HaMockContext } from '../../../src/core'
import { StateSimulator } from '../../../src/ui/components/StateSimulator'

const mockContext: HaMockContext = {
  states: { 'sensor.sn_family_current_event': 'No event' },
  attributes: { 'sensor.sn_family_current_event': { active: false } },
}

function renderSimulator(
  overrides: Partial<{
    onSetMockAttribute: (entityId: string, attribute: string, value: unknown) => void
    onRemoveMockAttribute: (entityId: string, attribute: string) => void
  }> = {},
) {
  const onSetMockAttribute = overrides.onSetMockAttribute ?? vi.fn()
  const onRemoveMockAttribute = overrides.onRemoveMockAttribute ?? vi.fn()

  render(
    <StateSimulator
      elements={[]}
      mockContext={mockContext}
      scope="all"
      onScopeChange={() => {}}
      onSetMockState={() => {}}
      onAddEntity={() => {}}
      onRemoveEntity={() => {}}
      onSetMockAttribute={onSetMockAttribute}
      onRemoveMockAttribute={onRemoveMockAttribute}
    />,
  )

  return { onSetMockAttribute, onRemoveMockAttribute }
}

describe('StateSimulator attribute editing', () => {
  it('coerces an edited attribute value to a boolean', () => {
    const { onSetMockAttribute } = renderSimulator()

    fireEvent.change(
      screen.getByLabelText('Attribute active of sensor.sn_family_current_event'),
      { target: { value: 'true' } },
    )

    expect(onSetMockAttribute).toHaveBeenCalledWith(
      'sensor.sn_family_current_event',
      'active',
      true,
    )
  })

  it('adds a new attribute with a numeric value', () => {
    const { onSetMockAttribute } = renderSimulator()

    fireEvent.change(
      screen.getByLabelText('New attribute name for sensor.sn_family_current_event'),
      { target: { value: 'temperature' } },
    )
    fireEvent.change(
      screen.getByLabelText('New attribute value for sensor.sn_family_current_event'),
      { target: { value: '21.5' } },
    )
    fireEvent.click(screen.getByLabelText('Add attribute to sensor.sn_family_current_event'))

    expect(onSetMockAttribute).toHaveBeenCalledWith(
      'sensor.sn_family_current_event',
      'temperature',
      21.5,
    )
  })

  it('removes an attribute', () => {
    const { onRemoveMockAttribute } = renderSimulator()

    fireEvent.click(
      screen.getByLabelText('Remove attribute active of sensor.sn_family_current_event'),
    )

    expect(onRemoveMockAttribute).toHaveBeenCalledWith(
      'sensor.sn_family_current_event',
      'active',
    )
  })
})
