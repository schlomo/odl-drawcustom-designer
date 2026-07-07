import { describe, expect, it } from 'vitest'
import {
  clearDemoMockAttributes,
  clearDemoMockStates,
  clearDemoVariables,
} from '../../../src/ui/lib/clear-demo-data'
import {
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
} from '../../../src/ui/data/showcase'

describe('clearDemoMockStates', () => {
  it('removes unmodified demo states but keeps edited and user-added ones', () => {
    const result = clearDemoMockStates({
      ...SHOWCASE_MOCK_STATES,
      'sensor.temperature': '30', // user-edited demo state
      'sensor.my_power': '1200', // user-added
    })
    expect(result).toEqual({ 'sensor.temperature': '30', 'sensor.my_power': '1200' })
  })

  it('clears everything when only the untouched demo states are present', () => {
    expect(clearDemoMockStates({ ...SHOWCASE_MOCK_STATES })).toEqual({})
  })
})

describe('clearDemoMockAttributes', () => {
  it('drops unmodified demo attributes, keeps edited values and user-added keys', () => {
    const result = clearDemoMockAttributes({
      'sensor.next_event': { active: false }, // matches demo → dropped
      'weather.home': { temperature: 18, humidity: 99 }, // humidity edited → kept
      'sensor.my_power': { unit: 'W' }, // user entity → kept
    })
    expect(result).toEqual({
      'weather.home': { humidity: 99 },
      'sensor.my_power': { unit: 'W' },
    })
  })

  it('clears everything when only untouched demo attributes are present', () => {
    expect(clearDemoMockAttributes(structuredClone(SHOWCASE_MOCK_ATTRIBUTES))).toEqual({})
  })
})

describe('clearDemoVariables', () => {
  it('removes unmodified demo variables but keeps edited and user-added ones', () => {
    const result = clearDemoVariables({
      ...SHOWCASE_VARIABLES,
      alert: 'false', // user-edited demo variable
      my_theme: 'dark', // user-added
    })
    expect(result).toEqual({ alert: 'false', my_theme: 'dark' })
  })
})
