import { describe, expect, it } from 'vitest'
import {
  LEGACY_MOCK_STATES_STORAGE_KEY,
  MOCK_STATES_MIGRATED_KEY,
  readMocksFromDb,
  writeMocksToDb,
} from '../../src/storage'
import {
  DEFAULT_MOCK_STATES,
  parseMockStates,
  readMockStates,
  writeMockStates,
} from '../../src/ui/preferences/mockStates'

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'

describe('mock storage', () => {
  it('round-trips mock states per project in IndexedDB', async () => {
    await writeMocksToDb(PROJECT_A, {
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
    })
    await writeMocksToDb(PROJECT_B, {
      'sensor.level': 42,
    })

    expect(await readMocksFromDb(PROJECT_A)).toEqual({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
    })
    expect(await readMocksFromDb(PROJECT_B)).toEqual({
      'sensor.level': 42,
    })
  })

  it('returns null when a project has no stored mocks', async () => {
    expect(await readMocksFromDb(PROJECT_A)).toBeNull()
  })

  it('readMockStates returns defaults when IndexedDB is empty', async () => {
    localStorage.setItem(MOCK_STATES_MIGRATED_KEY, '1')
    expect(await readMockStates(PROJECT_A)).toEqual(DEFAULT_MOCK_STATES)
  })

  it('writeMockStates persists through the UI adapter', async () => {
    localStorage.setItem(MOCK_STATES_MIGRATED_KEY, '1')
    await writeMockStates(PROJECT_A, {
      'sensor.temperature': '99',
      'binary_sensor.door': false,
    })

    expect(await readMockStates(PROJECT_A)).toEqual({
      'sensor.temperature': '99',
      'binary_sensor.door': false,
    })
  })

  it('migrates legacy localStorage mock states into IndexedDB once', async () => {
    localStorage.setItem(
      LEGACY_MOCK_STATES_STORAGE_KEY,
      JSON.stringify({
        'sensor.temperature': '12',
        'binary_sensor.door': 'on',
      }),
    )

    expect(await readMockStates(PROJECT_A)).toEqual({
      'sensor.temperature': '12',
      'binary_sensor.door': 'on',
    })
    expect(localStorage.getItem(LEGACY_MOCK_STATES_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(MOCK_STATES_MIGRATED_KEY)).toBe('1')

    localStorage.setItem(
      LEGACY_MOCK_STATES_STORAGE_KEY,
      JSON.stringify({ 'sensor.other': '1' }),
    )
    expect(await readMockStates(PROJECT_B)).toEqual(DEFAULT_MOCK_STATES)
  })

  it('handles overlapping writes without ConstraintError', async () => {
    const { flushMockWrites } = await import('../../src/storage/mocks')

    await Promise.all([
      writeMocksToDb(PROJECT_A, {
        'sensor.temperature': '1',
        'sensor.humidity': '2',
        'binary_sensor.door': 'on',
      }),
      writeMocksToDb(PROJECT_A, {
        'sensor.temperature': '9',
        'sensor.humidity': '8',
        'binary_sensor.door': 'off',
      }),
    ])
    await flushMockWrites()

    expect(await readMocksFromDb(PROJECT_A)).toEqual({
      'sensor.temperature': '9',
      'sensor.humidity': '8',
      'binary_sensor.door': 'off',
    })
  })

  it('ignores invalid entity ids and value types when parsing legacy data', () => {
    expect(
      parseMockStates({
        'not-an-entity': 'x',
        'sensor.ok': 'fine',
        'sensor.bad': { nested: true },
      }),
    ).toEqual({ 'sensor.ok': 'fine' })
  })
})
