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
    ...overrides,
  }
  return { props, ...render(<StateSimulator {...props} />) }
}

// PR #142 maintainer parity finding: the standalone Simulator had no
// discoverable jump-to-first-use affordance on a row's entity name — only
// focusing the (easy to miss) value input reported the entity, and that
// wiring was untested. This mirrors the ReferencedStatesPanel's clickable
// label so both surfaces behave and look the same (EntityFocusLabel).
describe('StateSimulator entity focus', () => {
  it('reports the entity id when its label is clicked and entity coupling is wired', () => {
    const onFocusEntity = vi.fn()
    const elements: DrawElement[] = [
      { type: 'text', value: "{{ states('sensor.temperature') }}", x: 0, y: 0 },
    ]
    renderSimulator({
      elements,
      mockContext: { states: { 'sensor.temperature': '21.5' }, attributes: {} },
      onFocusEntity,
    })

    fireEvent.click(screen.getByRole('button', { name: 'sensor.temperature' }))
    expect(onFocusEntity).toHaveBeenCalledWith('sensor.temperature')
  })

  it('stays inert text when no coupling channel is supplied', () => {
    renderSimulator({
      mockContext: { states: { 'sensor.temperature': '21.5' }, attributes: {} },
    })

    expect(screen.queryByRole('button', { name: 'sensor.temperature' })).toBeNull()
    expect(screen.getByTestId('simulator-entity-label-sensor.temperature')).toHaveTextContent(
      'sensor.temperature',
    )
  })
})
