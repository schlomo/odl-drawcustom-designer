import { describe, expect, it } from 'vitest'
import { evaluateTemplate } from '../../src/core'
import { hostStatesToMockData } from '../../src/embed/hostContract'

/**
 * Host `states` contract (issue #20): the host pushes an entity-id -> state
 * (or {state, attributes}) map; template preview must evaluate against the
 * pushed values — the observable outcome an embedded host cares about.
 */

describe('hostStatesToMockData', () => {
  it('feeds pushed plain state values into template preview', () => {
    const mock = hostStatesToMockData({
      'sensor.temperature': '21.5',
      'sensor.humidity': 48,
      'binary_sensor.door': 'off',
    })

    expect(
      evaluateTemplate("{{ states('sensor.temperature') }}", {
        states: mock.states,
        attributes: mock.attributes,
      }),
    ).toBe('21.5')
    expect(
      evaluateTemplate("{{ states('sensor.humidity') }}", {
        states: mock.states,
        attributes: mock.attributes,
      }),
    ).toBe('48')
  })

  it('feeds pushed {state, attributes} objects into states() and state_attr()', () => {
    const mock = hostStatesToMockData({
      'light.desk': { state: 'on', attributes: { brightness: 128, friendly_name: 'Desk' } },
    })
    const context = { states: mock.states, attributes: mock.attributes }

    expect(evaluateTemplate("{{ states('light.desk') }}", context)).toBe('on')
    expect(evaluateTemplate("{{ state_attr('light.desk', 'brightness') }}", context)).toBe('128')
    expect(evaluateTemplate("{{ state_attr('light.desk', 'friendly_name') }}", context)).toBe(
      'Desk',
    )
  })

  it('a later push fully replaces the previous state map', () => {
    const first = hostStatesToMockData({ 'sensor.temperature': '21.5' })
    const second = hostStatesToMockData({ 'sensor.temperature': '3.2' })

    expect(
      evaluateTemplate("{{ states('sensor.temperature') }}", {
        states: second.states,
        attributes: second.attributes,
      }),
    ).toBe('3.2')
    // Conversion is pure — the first snapshot is untouched.
    expect(first.states['sensor.temperature']).toBe('21.5')
  })
})
