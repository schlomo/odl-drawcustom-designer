import { describe, expect, it } from 'vitest'
import {
  db,
  ensureDbReady,
  readMocksFromDb,
  writeMocksToDb,
} from '../../src/storage'
import {
  DEFAULT_MOCK_ATTRIBUTES,
  DEFAULT_MOCK_STATES,
  parseMockStates,
  readMockStates,
  writeMockStates,
} from '../../src/ui/preferences/mockStates'

describe('mock storage', () => {
  it('round-trips mock states and attributes globally in IndexedDB', async () => {
    await writeMocksToDb({
      states: {
        'sensor.temperature': '18',
        'binary_sensor.door': 'on',
      },
      attributes: {
        'sensor.temperature': { unit_of_measurement: '°C' },
      },
    })

    expect(await readMocksFromDb()).toEqual({
      states: {
        'sensor.temperature': '18',
        'binary_sensor.door': 'on',
      },
      attributes: {
        'sensor.temperature': { unit_of_measurement: '°C' },
      },
    })
  })

  it('replaces the full mock map on write', async () => {
    await writeMocksToDb({
      states: { 'sensor.temperature': '18', 'binary_sensor.door': 'on' },
      attributes: {},
    })
    await writeMocksToDb({
      states: { 'sensor.level': 42 },
      attributes: {},
    })

    expect(await readMocksFromDb()).toEqual({
      states: { 'sensor.level': 42 },
      attributes: {},
    })
  })

  it('returns null when no mocks are stored', async () => {
    expect(await readMocksFromDb()).toBeNull()
  })

  it('loads legacy rows without an attributes field (migration)', async () => {
    await ensureDbReady()
    // Simulate rows written by the pre-attributes schema: no `attributes` key.
    await db.mocks.clear()
    await db.mocks.bulkPut([
      { entityId: 'sensor.temperature', value: '20' },
      { entityId: 'binary_sensor.door', value: 'off' },
    ] as never)

    expect(await readMocksFromDb()).toEqual({
      states: { 'sensor.temperature': '20', 'binary_sensor.door': 'off' },
      attributes: {},
    })
  })

  it('readMockStates returns defaults (states + attributes) when IndexedDB is empty', async () => {
    expect(await readMockStates()).toEqual({
      states: DEFAULT_MOCK_STATES,
      attributes: DEFAULT_MOCK_ATTRIBUTES,
    })
  })

  it('writeMockStates persists states and attributes through the UI adapter', async () => {
    await writeMockStates({
      states: { 'sensor.temperature': '99', 'binary_sensor.door': false },
      attributes: { 'binary_sensor.door': { device_class: 'door' } },
    })

    expect(await readMockStates()).toEqual({
      states: { 'sensor.temperature': '99', 'binary_sensor.door': false },
      attributes: { 'binary_sensor.door': { device_class: 'door' } },
    })
  })

  it('handles overlapping writes without ConstraintError', async () => {
    const { flushMockWrites } = await import('../../src/storage/mocks')

    await Promise.all([
      writeMocksToDb({
        states: {
          'sensor.temperature': '1',
          'sensor.humidity': '2',
          'binary_sensor.door': 'on',
        },
        attributes: {},
      }),
      writeMocksToDb({
        states: {
          'sensor.temperature': '9',
          'sensor.humidity': '8',
          'binary_sensor.door': 'off',
        },
        attributes: {},
      }),
    ])
    await flushMockWrites()

    expect(await readMocksFromDb()).toEqual({
      states: {
        'sensor.temperature': '9',
        'sensor.humidity': '8',
        'binary_sensor.door': 'off',
      },
      attributes: {},
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
