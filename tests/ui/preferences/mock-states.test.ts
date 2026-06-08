import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MOCK_STATES,
  readMockStates,
  writeMockStates,
} from '../../../src/ui/preferences/mockStates'
import {
  LEGACY_MOCK_STATES_STORAGE_KEY,
  MOCK_STATES_MIGRATED_KEY,
} from '../../../src/storage/keys'

describe('mock state preferences', () => {
  afterEach(() => {
    localStorage.removeItem(LEGACY_MOCK_STATES_STORAGE_KEY)
    localStorage.removeItem(MOCK_STATES_MIGRATED_KEY)
  })

  it('returns defaults when storage is empty', async () => {
    localStorage.setItem(MOCK_STATES_MIGRATED_KEY, '1')
    expect(await readMockStates()).toEqual(DEFAULT_MOCK_STATES)
  })

  it('round-trips mock states through IndexedDB', async () => {
    localStorage.setItem(MOCK_STATES_MIGRATED_KEY, '1')
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

  it('falls back to defaults for corrupt legacy JSON during migration', async () => {
    localStorage.setItem(LEGACY_MOCK_STATES_STORAGE_KEY, '{not json')
    expect(await readMockStates()).toEqual(DEFAULT_MOCK_STATES)
    expect(localStorage.getItem(MOCK_STATES_MIGRATED_KEY)).toBe('1')
  })
})
