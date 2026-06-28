import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MOCK_ATTRIBUTES,
  DEFAULT_MOCK_STATES,
  readMockStates,
  writeMockStates,
} from '../../../src/ui/preferences/mockStates'

describe('mock state preferences', () => {
  it('returns defaults (states + attributes) when storage is empty', async () => {
    expect(await readMockStates()).toEqual({
      states: DEFAULT_MOCK_STATES,
      attributes: DEFAULT_MOCK_ATTRIBUTES,
    })
  })

  it('ships a useful attribute example in the defaults', () => {
    expect(DEFAULT_MOCK_ATTRIBUTES['sensor.sn_family_current_event']).toMatchObject({
      active: false,
    })
  })

  it('round-trips mock states and attributes through IndexedDB', async () => {
    await writeMockStates({
      states: {
        'sensor.temperature': '18',
        'binary_sensor.door': 'on',
        'sensor.level': 42,
      },
      attributes: {
        'sensor.temperature': { unit_of_measurement: '°C' },
      },
    })

    expect(await readMockStates()).toEqual({
      states: {
        'sensor.temperature': '18',
        'binary_sensor.door': 'on',
        'sensor.level': 42,
      },
      attributes: {
        'sensor.temperature': { unit_of_measurement: '°C' },
      },
    })
  })
})
