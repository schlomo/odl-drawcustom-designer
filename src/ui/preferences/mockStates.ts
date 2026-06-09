import type { HaMockContext } from '../../core'
import {
  LEGACY_MOCK_STATES_STORAGE_KEY,
  MOCK_STATES_MIGRATED_KEY,
  readMocksFromDb,
  writeMocksToDb,
} from '../../storage'

export const DEFAULT_MOCK_STATES: HaMockContext['states'] = {
  'sensor.temperature': '21.5',
  'binary_sensor.door': 'off',
}

function isMockStateValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isEntityId(value: string): boolean {
  return /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(value)
}

export function parseMockStates(raw: unknown): HaMockContext['states'] | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const states: HaMockContext['states'] = {}

  for (const [entityId, value] of Object.entries(raw)) {
    if (!isEntityId(entityId) || !isMockStateValue(value)) {
      continue
    }
    states[entityId] = value
  }

  return Object.keys(states).length > 0 ? states : null
}

async function migrateLegacyMockStates(): Promise<void> {
  try {
    if (localStorage.getItem(MOCK_STATES_MIGRATED_KEY)) {
      return
    }

    const legacyRaw = localStorage.getItem(LEGACY_MOCK_STATES_STORAGE_KEY)
    if (legacyRaw) {
      try {
        const parsed = parseMockStates(JSON.parse(legacyRaw))
        if (parsed) {
          const existing = await readMocksFromDb()
          if (!existing) {
            await writeMocksToDb(parsed)
          }
        }
      } catch {
        // ignore corrupt legacy payload
      }
      localStorage.removeItem(LEGACY_MOCK_STATES_STORAGE_KEY)
    }

    localStorage.setItem(MOCK_STATES_MIGRATED_KEY, '1')
  } catch {
    // ignore private mode / quota
  }
}

export async function readMockStates(): Promise<HaMockContext['states']> {
  await migrateLegacyMockStates()
  const stored = await readMocksFromDb()
  return stored ?? { ...DEFAULT_MOCK_STATES }
}

export async function writeMockStates(states: HaMockContext['states']): Promise<void> {
  await writeMocksToDb(states)
}
