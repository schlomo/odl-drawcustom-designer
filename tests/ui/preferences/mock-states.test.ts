import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MOCK_STATES,
  parseMockStates,
  readMockStates,
  writeMockStates,
} from '../../../src/ui/preferences/mockStates'
import { MOCK_STATES_STORAGE_KEY } from '../../../src/ui/preferences/keys'

describe('mock state preferences', () => {
  afterEach(() => {
    localStorage.removeItem(MOCK_STATES_STORAGE_KEY)
  })

  it('returns defaults when storage is empty', () => {
    expect(readMockStates()).toEqual(DEFAULT_MOCK_STATES)
  })

  it('round-trips mock states through localStorage', () => {
    writeMockStates({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
      'sensor.level': 42,
    })

    expect(readMockStates()).toEqual({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
      'sensor.level': 42,
    })
  })

  it('ignores invalid entity ids and value types', () => {
    expect(
      parseMockStates({
        'not-an-entity': 'x',
        'sensor.ok': 'fine',
        'sensor.bad': { nested: true },
      }),
    ).toEqual({ 'sensor.ok': 'fine' })
  })

  it('falls back to defaults for corrupt JSON', () => {
    localStorage.setItem(MOCK_STATES_STORAGE_KEY, '{not json')
    expect(readMockStates()).toEqual(DEFAULT_MOCK_STATES)
  })
})
