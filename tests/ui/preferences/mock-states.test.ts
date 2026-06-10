import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MOCK_STATES,
  readMockStates,
  writeMockStates,
} from '../../../src/ui/preferences/mockStates'

describe('mock state preferences', () => {
  it('returns defaults when storage is empty', async () => {
    expect(await readMockStates()).toEqual(DEFAULT_MOCK_STATES)
  })

  it('round-trips mock states through IndexedDB', async () => {
    await writeMockStates({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
      'sensor.level': 42,
    })

    expect(await readMockStates()).toEqual({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
      'sensor.level': 42,
    })
  })
})
