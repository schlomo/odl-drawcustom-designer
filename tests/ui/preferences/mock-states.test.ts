import { describe, expect, it } from 'vitest'
import {
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
} from '../../../src/ui/data/showcase'
import { readMockStates, writeMockStates } from '../../../src/ui/preferences/mockStates'

describe('mock state preferences', () => {
  it('returns showcase seed (states + attributes) when storage is empty', async () => {
    expect(await readMockStates()).toEqual({
      states: SHOWCASE_MOCK_STATES,
      attributes: SHOWCASE_MOCK_ATTRIBUTES,
    })
  })

  it('ships a useful attribute example in the showcase seed', () => {
    expect(SHOWCASE_MOCK_ATTRIBUTES['sensor.next_event']).toMatchObject({
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
        'binary_sensor.door': { device_class: 'door' },
      },
    })

    expect(await readMockStates()).toEqual({
      states: {
        'sensor.temperature': '18',
        'binary_sensor.door': 'on',
        'sensor.level': 42,
      },
      attributes: {
        'binary_sensor.door': { device_class: 'door' },
      },
    })
  })
})
