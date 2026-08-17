/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
