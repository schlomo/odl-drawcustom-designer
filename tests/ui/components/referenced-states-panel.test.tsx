/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ReferencedStatesPanel } from '../../../src/ui/components/ReferencedStatesPanel'
import type { HostStateCatalog } from '../../../src/embed/hostContract'

/**
 * Referenced-states panel (issue #107, ADR-018 state catalog): under a
 * host-fed adapter this read-only panel replaces the State Simulator. It shows
 * only the states the current payload references — the host's whole catalog
 * stays reachable through YAML/template autocomplete — with the host's friendly
 * name where one was pushed, the live value, and an honest marker for a state
 * the payload names but the host does not supply.
 */

const PAYLOAD: DrawElement[] = [
  {
    type: 'text',
    value: "{{ states('sensor.temperature') }} · {{ state_attr('weather.home', 'humidity') }}",
    x: 0,
    y: 0,
  },
]

function catalog(overrides: Partial<HostStateCatalog> = {}): HostStateCatalog {
  return {
    values: { 'sensor.temperature': '21.5', 'sensor.unreferenced': 'on' },
    attributes: { 'weather.home': { humidity: 64 } },
    names: {
      'sensor.temperature': 'Living-room temperature',
      'sensor.unreferenced': 'Hallway motion',
    },
    ...overrides,
  }
}

describe('ReferencedStatesPanel', () => {
  it('lists only the states the payload references', () => {
    render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)

    expect(screen.getByText('sensor.temperature')).toBeInTheDocument()
    expect(screen.getByText('weather.home')).toBeInTheDocument()
    expect(screen.queryByText('sensor.unreferenced')).toBeNull()
    expect(screen.queryByText('Hallway motion')).toBeNull()
  })

  it('shows the host-supplied friendly name alongside the key and the current value', () => {
    render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)

    expect(screen.getByText('Living-room temperature')).toBeInTheDocument()
    expect(screen.getByText('21.5')).toBeInTheDocument()
  })

  it('marks a referenced state the host does not supply instead of faking a value', () => {
    render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)

    const row = screen.getByTestId('referenced-state-row-weather.home')
    expect(row).toHaveTextContent('not supplied')
    // The state itself is missing, but the attribute the payload reads is
    // supplied — the panel must not claim otherwise.
    expect(row).toHaveTextContent('humidity')
    expect(row).toHaveTextContent('64')
  })

  it('marks a referenced attribute the host does not supply', () => {
    render(
      <ReferencedStatesPanel
        elements={PAYLOAD}
        catalog={catalog({ attributes: {} })}
      />,
    )

    const row = screen.getByTestId('referenced-state-row-weather.home')
    expect(row).toHaveTextContent('humidity')
    expect(row.textContent?.match(/not supplied/g)).toHaveLength(2)
  })

  it('reflects a later push: same rows, new values', () => {
    const { rerender } = render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)
    expect(screen.getByText('21.5')).toBeInTheDocument()

    rerender(
      <ReferencedStatesPanel
        elements={PAYLOAD}
        catalog={catalog({ values: { 'sensor.temperature': '3.2' } })}
      />,
    )

    expect(screen.getByText('3.2')).toBeInTheDocument()
    expect(screen.queryByText('21.5')).toBeNull()
  })

  it('is read-only: no state, attribute or entity editing controls', () => {
    render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)

    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // Issue #107 review: the panel and the evaluator must agree on what a payload
  // reads. Dotted access is evaluated (`states.sensor.e.state`), so it must be
  // listed — with its attribute base folded into the same row.
  it('lists a state the payload reads through dotted access', () => {
    render(
      <ReferencedStatesPanel
        elements={[{ type: 'text', value: '{{ states.sensor.temperature.state }}', x: 0, y: 0 }]}
        catalog={catalog()}
      />,
    )

    const row = screen.getByTestId('referenced-state-row-sensor.temperature')
    expect(row).toHaveTextContent('Living-room temperature')
    expect(row).toHaveTextContent('21.5')
  })

  it('lists a dotted attribute read as one row: the state, its name and the attribute', () => {
    render(
      <ReferencedStatesPanel
        elements={[
          { type: 'text', value: '{{ states.weather.home.attributes.humidity }}', x: 0, y: 0 },
        ]}
        catalog={catalog()}
      />,
    )

    const rows = screen.getAllByTestId(/^referenced-state-row-/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('weather.home')
    expect(rows[0]).toHaveTextContent('humidity')
    expect(rows[0]).toHaveTextContent('64')
  })

  // Parity with the Simulator's entity coupling (`onFocusEntity`): picking a
  // state jumps the YAML editor to where the design reads it. Offered only when
  // the shell supplies the channel — nothing else about the panel is clickable.
  it('reports the picked state to the shell when entity coupling is wired', () => {
    const onFocusEntity = vi.fn()
    render(
      <ReferencedStatesPanel
        elements={PAYLOAD}
        catalog={catalog()}
        onFocusEntity={onFocusEntity}
      />,
    )

    // The row's label is the friendly name where the host supplied one — the
    // accessible name is what the user reads, and it reports the raw key.
    fireEvent.click(screen.getByRole('button', { name: 'Living-room temperature' }))
    expect(onFocusEntity).toHaveBeenCalledWith('sensor.temperature')

    fireEvent.click(screen.getByRole('button', { name: 'weather.home' }))
    expect(onFocusEntity).toHaveBeenLastCalledWith('weather.home')
  })

  it('stays inert text when no coupling channel is supplied', () => {
    render(<ReferencedStatesPanel elements={PAYLOAD} catalog={catalog()} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('says so when the payload references no states at all', () => {
    render(
      <ReferencedStatesPanel
        elements={[{ type: 'text', value: 'static', x: 0, y: 0 }]}
        catalog={catalog()}
      />,
    )

    expect(screen.getByText(/no states/i)).toBeInTheDocument()
  })
})
