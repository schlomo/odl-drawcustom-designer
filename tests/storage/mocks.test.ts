import { describe, expect, it } from 'vitest'
import {
  readMocksFromDb,
  writeMocksToDb,
} from '../../src/storage'
import {
  DEFAULT_MOCK_STATES,
  parseMockStates,
  readMockStates,
  writeMockStates,
} from '../../src/ui/preferences/mockStates'

describe('mock storage', () => {
  it('round-trips mock states globally in IndexedDB', async () => {
    await writeMocksToDb({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
    })

    expect(await readMocksFromDb()).toEqual({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
    })
  })

  it('replaces the full mock map on write', async () => {
    await writeMocksToDb({
      'sensor.temperature': '18',
      'binary_sensor.door': 'on',
    })
    await writeMocksToDb({
      'sensor.level': 42,
    })

    expect(await readMocksFromDb()).toEqual({
      'sensor.level': 42,
    })
  })

  it('returns null when no mocks are stored', async () => {
    expect(await readMocksFromDb()).toBeNull()
  })

  it('readMockStates returns defaults when IndexedDB is empty', async () => {
    expect(await readMockStates()).toEqual(DEFAULT_MOCK_STATES)
  })

  it('writeMockStates persists through the UI adapter', async () => {
    await writeMockStates({
      'sensor.temperature': '99',
      'binary_sensor.door': false,
    })

    expect(await readMockStates()).toEqual({
      'sensor.temperature': '99',
      'binary_sensor.door': false,
    })
  })

  it('handles overlapping writes without ConstraintError', async () => {
    const { flushMockWrites } = await import('../../src/storage/mocks')

    await Promise.all([
      writeMocksToDb({
        'sensor.temperature': '1',
        'sensor.humidity': '2',
        'binary_sensor.door': 'on',
      }),
      writeMocksToDb({
        'sensor.temperature': '9',
        'sensor.humidity': '8',
        'binary_sensor.door': 'off',
      }),
    ])
    await flushMockWrites()

    expect(await readMocksFromDb()).toEqual({
      'sensor.temperature': '9',
      'sensor.humidity': '8',
      'binary_sensor.door': 'off',
    })
  })

  it('ignores invalid entity ids and value types when parsing mock data', () => {
    expect(
      parseMockStates({
        'not-an-entity': 'x',
        'sensor.ok': 'fine',
        'sensor.bad': { nested: true },
      }),
    ).toEqual({ 'sensor.ok': 'fine' })
  })
})
